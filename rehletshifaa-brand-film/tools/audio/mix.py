"""Voice-first mix: stems → master.

Stems (48 kHz, 24-bit FLAC): narration, music, ambience, foley, ui, transitions, logo.
Narration is the reference: music is EQ-carved around speech and ducked by a narration-driven envelope,
then ridden slowly so its level never swells; ambience beds are crossfaded loops at a target loudness;
every effect comes from a cue authored in the scene next to the action that causes it.
Master: gentle bus glue → loudness to -16 LUFS integrated → true-peak ceiling -1 dBTP.

Usage: python3 -I tools/audio/mix.py <cues.json> <out_dir> [--music path] [--name prefix] [--music-target LUFS]
"""
from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from pedalboard import (Compressor, HighpassFilter, HighShelfFilter, LowShelfFilter, Pedalboard, PeakFilter)
from scipy.signal import resample_poly

ROOT = Path(__file__).resolve().parents[2]
SR = 48000
AUD = ROOT / "assets" / "audio"
SEARCH = [AUD / "foley" / "src", AUD / "brand", AUD / "ambience" / "src"]
STEMS = ["narration", "music", "ambience", "foley", "ui", "transitions", "logo"]
METER = pyln.Meter(SR)


def load(path: Path) -> np.ndarray:
    """Any audio → float32 stereo @48k."""
    if path.suffix.lower() != ".wav":
        with tempfile.TemporaryDirectory() as td:
            w = Path(td) / "x.wav"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(path), "-ar", str(SR), "-ac", "2", str(w)], check=True)
            x, sr = sf.read(w, always_2d=True)
    else:
        x, sr = sf.read(path, always_2d=True)
        if sr != SR:
            x = resample_poly(x, SR, sr, axis=0)
        if x.shape[1] == 1:
            x = np.repeat(x, 2, axis=1)
    return x.astype(np.float32)


def find(name: str) -> Path:
    for d in SEARCH:
        for ext in (".wav", ".mp3"):
            p = d / f"{name}{ext}"
            if p.exists():
                return p
    raise FileNotFoundError(name)


def lufs(x: np.ndarray) -> float:
    return METER.integrated_loudness(x) if np.max(np.abs(x)) > 1e-6 and len(x) > SR * 0.5 else -99.0


def db(v: float) -> float:
    return 10 ** (v / 20)


def fade(x: np.ndarray, fin: float, fout: float) -> np.ndarray:
    x = x.copy()
    a, b = int(fin * SR), int(fout * SR)
    if a:
        x[:a] *= np.linspace(0, 1, a)[:, None] ** 2
    if b:
        x[-b:] *= np.linspace(1, 0, b)[:, None] ** 2
    return x


def place(buf: np.ndarray, sig: np.ndarray, t: float) -> None:
    i = int(round(t * SR))
    if i < 0:
        sig, i = sig[-i:], 0
    j = min(len(buf), i + len(sig))
    if j > i:
        buf[i:j] += sig[: j - i]


def loop_to(x: np.ndarray, n: int, xf: float = 1.5) -> np.ndarray:
    """Seamless loop by equal-power crossfades."""
    k = int(xf * SR)
    out = x.copy()
    while len(out) < n:
        a = np.cos(np.linspace(0, np.pi / 2, k))[:, None]
        b = np.sin(np.linspace(0, np.pi / 2, k))[:, None]
        out = np.concatenate([out[:-k], out[-k:] * a + x[:k] * b, x[k:]])
    return out[:n]


def envelope(x: np.ndarray, attack: float, release: float, look: float) -> np.ndarray:
    """Smoothed speech-presence envelope (0..1) with look-ahead, for ducking."""
    mono = np.abs(x).mean(axis=1)
    win = int(0.02 * SR)
    rms = np.sqrt(np.convolve(mono ** 2, np.ones(win) / win, mode="same"))
    gate = (rms > db(-45)).astype(np.float32)
    shift = int(look * SR)
    gate = np.concatenate([gate[shift:], np.zeros(shift, np.float32)])
    out = np.zeros_like(gate)
    a, r = np.exp(-1 / (attack * SR)), np.exp(-1 / (release * SR))
    v = 0.0
    # vectorised-enough: process in blocks of 64 samples (envelopes are slow)
    blk = 64
    for i in range(0, len(gate), blk):
        g = gate[i:i + blk].max()
        c = a if g > v else r
        v = c * v + (1 - c) * g
        out[i:i + blk] = v
    return out


def true_peak_limit(x: np.ndarray, ceiling_db: float = -1.0, look_ms: float = 1.5, release_ms: float = 90.0) -> np.ndarray:
    """Look-ahead true-peak limiter (4x oversampled detection), no make-up gain: transparent below the ceiling."""
    from scipy.ndimage import maximum_filter1d
    ceil = db(ceiling_db - 0.15)
    up = np.abs(resample_poly(x, 4, 1, axis=0)).max(axis=1)
    peak = up[: (len(up) // 4) * 4].reshape(-1, 4).max(axis=1)
    peak = np.pad(peak, (0, len(x) - len(peak)), mode="edge")
    red = np.maximum(0.0, 1.0 - ceil / np.maximum(peak, 1e-9))  # required gain reduction (0..1)
    look = max(1, int(look_ms / 1000 * SR))
    red = maximum_filter1d(red, size=2 * look + 1)
    rel = np.exp(-1.0 / (release_ms / 1000 * SR / 32))
    blk = red[: (len(red) // 32) * 32].reshape(-1, 32).max(axis=1)
    sm = np.empty_like(blk)
    v = 0.0
    for i, r in enumerate(blk):
        v = r if r > v else v * rel
        sm[i] = v
    g = 1.0 - np.repeat(sm, 32)
    g = np.pad(g, (0, len(x) - len(g)), mode="edge")
    return (x * g[:, None]).astype(np.float32)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cues")
    ap.add_argument("out")
    ap.add_argument("--music")
    ap.add_argument("--name", default="mix")
    ap.add_argument("--music-target", type=float, default=-31.0, help="short-term LUFS the music rider holds the bed at")
    a = ap.parse_args()
    data = json.loads(Path(a.cues).read_text())
    lang = data["lang"]
    N = int((data["total"] + 0.5) * SR)
    stems = {k: np.zeros((N, 2), np.float32) for k in STEMS}

    # ---------------------------------------------------------------- narration
    vo_chain = Pedalboard([HighpassFilter(75), LowShelfFilter(cutoff_frequency_hz=180, gain_db=-1.5), PeakFilter(cutoff_frequency_hz=3200, gain_db=1.2, q=0.8),
                           HighShelfFilter(cutoff_frequency_hz=8500, gain_db=-1.5), Compressor(threshold_db=-24, ratio=2.5, attack_ms=8, release_ms=120)])
    for v in data["vo"]:
        x = load(ROOT / "assets/audio/voiceover" / lang / v["file"])
        x = vo_chain(x.T, SR).T
        place(stems["narration"], x, v["t"])
    nar_l = lufs(stems["narration"])
    stems["narration"] *= db(-18.0 - nar_l)  # narration reference level before mastering

    # ---------------------------------------------------------------- music: carve, duck, ride
    if a.music:
        m = load(Path(a.music))
        off = data.get("music_offset", 0.0)
        m = m[int(off * SR):]
        m = np.pad(m, ((0, max(0, N - len(m))), (0, 0)))[:N]
        m = Pedalboard([HighpassFilter(70), PeakFilter(cutoff_frequency_hz=320, gain_db=-2.5, q=0.9), PeakFilter(cutoff_frequency_hz=2800, gain_db=-4.0, q=0.7),
                        HighShelfFilter(cutoff_frequency_hz=7000, gain_db=-2.0)])(m.T, SR).T
        # slow rider: equalise the bed to a steady short-term loudness (no swells)
        win = int(3 * SR)
        target = a.music_target
        gains = []
        for i in range(0, N, SR // 2):
            seg = m[max(0, i - win // 2):i + win // 2]
            l = METER.integrated_loudness(seg) if np.max(np.abs(seg)) > 1e-5 and len(seg) > SR else target
            gains.append(np.clip(target - l, -12, 6))
        g = np.interp(np.arange(N), np.arange(len(gains)) * (SR // 2), gains)
        g = np.convolve(g, np.ones(SR) / SR, mode="same")
        m *= db(g)[:, None]
        env = envelope(stems["narration"], attack=0.18, release=0.9, look=0.25)
        duck = db(-9.0 * env)  # -9 dB under speech, released between lines
        m *= duck[:, None]
        stems["music"] = m.astype(np.float32)

    # ---------------------------------------------------------------- ambience beds (gain = target LUFS)
    for c in [c for c in data["cues"] if c["kind"] == "amb"]:
        x = load(find(c["name"]))
        n = int((c["end"] - c["t"]) * SR)
        bed = loop_to(x, n)
        lb = lufs(bed)
        if not np.isfinite(lb) or n < 3 * SR:  # too short to gate reliably: measure the source loop instead
            lb = lufs(x)
        bed *= db(c["gain"] - lb)
        bed = fade(bed, c.get("fadeIn", 1.2), c.get("fadeOut", 1.4))
        place(stems["ambience"], bed, c["t"])

    # ---------------------------------------------------------------- one-shots (gain = peak dBFS)
    for c in [c for c in data["cues"] if c["kind"] == "sfx"]:
        x = load(find(c["name"]))
        if c.get("dur"):
            x = fade(x[: int(c["dur"] * SR)], 0.01, min(0.25, c["dur"] / 3))
        x = x / (np.max(np.abs(x)) + 1e-9) * db(c["gain"])
        if c.get("pan") is not None:
            p = float(c["pan"])
            x = x * np.array([min(1, 2 * (1 - p)), min(1, 2 * p)], np.float32)
        stem = "ui" if c["name"].startswith("ui_") else "logo" if c["name"].startswith("logo") else "transitions" if c["name"].startswith("transition") else "foley"
        place(stems[stem], x, c["t"])

    # ---------------------------------------------------------------- master
    mix = sum(stems.values())
    bus = Pedalboard([HighpassFilter(28), Compressor(threshold_db=-20, ratio=1.6, attack_ms=30, release_ms=300)])
    mix = bus(mix.T, SR).T
    mix *= db(-16.0 - lufs(mix))
    mix = true_peak_limit(mix, -1.0)
    final_l = lufs(mix)
    tp = 20 * np.log10(np.max(np.abs(resample_poly(mix, 4, 1, axis=0))) + 1e-12)

    out = Path(a.out)
    (out / "stems").mkdir(parents=True, exist_ok=True)
    scale = db(-16.0 - lufs(sum(stems.values())))  # stems share the master's gain so they sum back to the mix
    for k, x in stems.items():
        if np.max(np.abs(x)) > 0:
            sf.write(out / "stems" / f"{a.name}_{k}.flac", np.clip(x * scale, -1, 1), SR, subtype="PCM_24")
    sf.write(out / f"{a.name}.wav", mix.astype(np.float32), SR, subtype="PCM_24")

    # speech vs music separation where narration is active
    env = envelope(stems["narration"], 0.05, 0.3, 0.0) > 0.5
    def lufs_mask(x: np.ndarray) -> float:
        sel = x[env]
        return lufs(sel) if len(sel) > SR else -99
    rep = {
        "name": a.name, "lang": lang, "duration_s": round(N / SR, 2), "master_lufs_i": round(final_l, 2), "master_true_peak_dbtp": round(tp, 2),
        "stems_lufs_i_pre_master": {k: round(lufs(v), 1) for k, v in stems.items()},
        "narration_vs_music_during_speech_lu": round(lufs_mask(stems["narration"]) - lufs_mask(stems["music"]), 1) if a.music else None,
        "cues": len(data["cues"]), "lines": len(data["vo"]),
    }
    (out / f"{a.name}.report.json").write_text(json.dumps(rep, indent=1, default=float))
    print(json.dumps(rep, indent=1, default=float))


if __name__ == "__main__":
    main()
