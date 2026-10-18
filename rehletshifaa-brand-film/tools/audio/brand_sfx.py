"""Original RehletShifaa sound marks and room tones (synthesised, royalty-free).

All marks share the score's key (D major) and felt-piano timbre so UI sounds, transitions and the logo
feel like one audio identity rather than stock notifications.
Usage: python3 -I tools/audio/brand_sfx.py <out_dir>
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from pedalboard import Pedalboard, Reverb, LowpassFilter, HighpassFilter

sys.path.insert(0, str(Path(__file__).parent))
from score import piano, midi_hz, m, SR  # noqa: E402


def BandpassFilter(fc: float, q: float = 0.7) -> Pedalboard:
    """Band-pass as a nested high-pass + low-pass pair (pedalboard has no native band-pass)."""
    k = 1 + 1 / max(q, 0.1)
    return Pedalboard([HighpassFilter(fc / k), LowpassFilter(fc * k)])


def stereo(x: np.ndarray, pan: float = 0.5) -> np.ndarray:
    return np.stack([x * (1 - pan) * 1.4, x * pan * 1.4], axis=1)


def fx(x: np.ndarray, *chain) -> np.ndarray:
    return Pedalboard(list(chain))(x.T.astype(np.float32), SR).T


def norm(x: np.ndarray, peak_db: float) -> np.ndarray:
    return x / (np.max(np.abs(x)) + 1e-9) * 10 ** (peak_db / 20)


def chime(notes: list[str], gaps: float, vel: float, tail: float = 1.6) -> np.ndarray:
    rng = np.random.default_rng(7)
    n = int((gaps * len(notes) + tail + 1.0) * SR)
    out = np.zeros(n)
    for i, nn in enumerate(notes):
        s = piano(midi_hz(m(nn)), 0.5, vel, rng)
        # soften the hammer: a gentle bell-like overtone at 3x adds "glass" without brightness
        t = np.arange(len(s)) / SR
        s += 0.08 * vel * np.sin(2 * np.pi * midi_hz(m(nn)) * 3.01 * t) * np.exp(-t / 0.35)
        a = int(i * gaps * SR)
        out[a:a + len(s)] += s[: n - a]
    return out


def main(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(11)
    verb = Reverb(room_size=0.6, damping=0.6, wet_level=0.28, dry_level=0.8, width=0.8)

    # UI confirm — two soft notes, rising a fifth (D5 → A5)
    ui = fx(stereo(chime(["D5", "A5"], 0.09, 0.5, 1.0), 0.55), HighpassFilter(300), LowpassFilter(6000), verb)
    sf.write(out / "ui_confirm.wav", norm(ui, -6), SR, subtype="PCM_24")

    # case received / submission complete — three notes, settled (D5 F#5 A5)
    sub = fx(stereo(chime(["D5", "F#5", "A5"], 0.11, 0.45, 1.4), 0.5), HighpassFilter(250), LowpassFilter(6000), verb)
    sf.write(out / "ui_submitted.wav", norm(sub, -6), SR, subtype="PCM_24")

    # message received (follow-up) — single warm note with its octave, very short
    msg = fx(stereo(chime(["A5", "A4"], 0.0, 0.42, 1.2), 0.6), HighpassFilter(250), LowpassFilter(5500), verb)
    sf.write(out / "ui_message.wav", norm(msg, -6), SR, subtype="PCM_24")

    # appointment confirmed — calendar tick: soft wooden tap + one note
    tap = rng.standard_normal(int(0.03 * SR)) * np.exp(-np.arange(int(0.03 * SR)) / (0.004 * SR))
    tap = fx(stereo(np.concatenate([tap, np.zeros(int(1.6 * SR))])), BandpassFilter(1800, 1.2))
    cal = tap * 0.6 + np.pad(fx(stereo(chime(["E5"], 0, 0.4, 1.2)), verb), ((0, max(0, len(tap) - int(2.2 * SR))), (0, 0)))[: len(tap)]
    sf.write(out / "ui_calendar.wav", norm(cal, -6), SR, subtype="PCM_24")

    # transition air — 1.4 s breath: band-limited noise swell, slow sweep, no whoosh
    n = int(1.4 * SR)
    t = np.arange(n) / SR
    env = np.sin(np.pi * t / 1.4) ** 2
    noise = rng.standard_normal((n, 2)) * env[:, None]
    lo = fx(noise, BandpassFilter(700, 0.7))
    hi = fx(noise, BandpassFilter(2400, 0.9))
    w = (t / 1.4)[:, None]
    air = lo * (1 - w) + hi * w * 0.6
    air = fx(air, LowpassFilter(5000), Reverb(room_size=0.7, wet_level=0.35, dry_level=0.7))
    sf.write(out / "transition_air.wav", norm(air, -10), SR, subtype="PCM_24")

    # paper-to-screen transition — a single soft page-like flick (filtered noise burst with a tail)
    n = int(0.9 * SR)
    t = np.arange(n) / SR
    burst = rng.standard_normal(n) * (np.exp(-t / 0.08) * np.clip(t / 0.01, 0, 1))
    flick = fx(stereo(burst), BandpassFilter(3200, 0.8), LowpassFilter(7000), Reverb(room_size=0.4, wet_level=0.25))
    sf.write(out / "transition_paper.wav", norm(flick, -12), SR, subtype="PCM_24")

    # logo signature — Dadd9 felt-piano chord, staggered, over a quiet air swell; resolves the journey motif
    rng2 = np.random.default_rng(3)
    dur = 5.5
    N = int(dur * SR)
    logo = np.zeros((N, 2))
    for i, (nn, v, pan) in enumerate([("D3", 0.32, 0.45), ("A3", 0.26, 0.5), ("E4", 0.24, 0.55), ("F#4", 0.26, 0.6), ("D5", 0.22, 0.5)]):
        s = stereo(piano(midi_hz(m(nn)), 3.5, v, rng2), pan)
        a = int(i * 0.06 * SR)
        logo[a:a + len(s)] += s[: N - a]
    t = np.arange(N) / SR
    sw = rng2.standard_normal((N, 2)) * (np.clip(t / 1.2, 0, 1) * np.exp(-np.maximum(t - 1.2, 0) / 1.6))[:, None] * 0.05
    sw = fx(sw, BandpassFilter(1600, 0.6))
    logo = fx(logo + sw, HighpassFilter(60), Reverb(room_size=0.88, damping=0.55, wet_level=0.4, dry_level=0.7, width=1.0))
    logo *= np.clip((dur - t) / 1.5, 0, 1)[:, None]
    sf.write(out / "logo_signature.wav", norm(logo, -4), SR, subtype="PCM_24")

    # room tones: office (HVAC-like broadband, very dark) and clinic (slightly brighter, calmer)
    for name, lp, hp, tilt in (("roomtone_office", 1400, 60, 0.9), ("roomtone_clinic", 2200, 80, 0.7)):
        n = int(20 * SR)
        white = rng.standard_normal((n, 2))
        # pink-ish: integrate a little
        pink = np.cumsum(white, axis=0)
        pink -= np.convolve(pink[:, 0], np.ones(4800) / 4800, mode="same")[:, None]
        rt = fx(pink * 0.002 + white * 0.01 * (1 - tilt), HighpassFilter(hp), LowpassFilter(lp))
        # loopable: crossfade end into start
        x = int(1.0 * SR)
        fade = np.linspace(0, 1, x)[:, None]
        rt[:x] = rt[:x] * fade + rt[-x:] * (1 - fade)
        rt = rt[:-x]
        sf.write(out / f"{name}.wav", norm(rt, -30), SR, subtype="PCM_24")
    print("ok", sorted(p.name for p in out.iterdir()))


if __name__ == "__main__":
    main(Path(sys.argv[1]))
