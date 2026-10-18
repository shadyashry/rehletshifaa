"""Original score for "From Uncertainty to Clarity" — calm cinematic healthcare ambient.

Synthesised from first principles (no samples, no third-party music): a felt-piano additive model with
stretched partials and per-partial decay, warm detuned pads, a low air layer, and a 4-note "journey motif"
(F#–A–E–D, scale degrees 3-5-2-1 in D major) that develops across the film and resolves on the logo.

The score is tempo-mapped to picture: every scene starts on a downbeat, so chord changes land on cuts in
each language version. Tempo stays within 60–72 BPM.

Usage: python3 -I tools/audio/score.py <timing.json> <out.wav>
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from pedalboard import Pedalboard, Reverb, LowpassFilter, HighpassFilter, Compressor, Gain, HighShelfFilter

SR = 48000


def midi_hz(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


NOTE = {n: i for i, n in enumerate(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"])}


def m(name: str) -> int:
    """'F#4' → MIDI number."""
    p, o = name[:-1], int(name[-1])
    return 12 * (o + 1) + NOTE[p]


# ------------------------------------------------------------------ instruments
def piano(freq: float, dur: float, vel: float, rng: np.random.Generator) -> np.ndarray:
    """Felt piano: inharmonic stretched partials, faster decay for higher partials, soft hammer thump."""
    n = int((dur + 2.6) * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    B = 0.00018  # inharmonicity
    bright = 0.35 + 0.5 * vel
    for k in range(1, 13):
        fk = freq * k * np.sqrt(1 + B * k * k)
        if fk > 9000:
            break
        amp = (1.0 / k ** (1.45 - 0.35 * bright)) * (0.55 if k == 2 else 1.0)
        tau = (2.8 if freq < 250 else 1.9) / (1 + 0.55 * (k - 1)) * (1.0 + 0.4 * (1 - vel))
        det = 1 + (rng.random() - 0.5) * 0.0009  # two-string chorus
        env = np.exp(-t / tau)
        ph = rng.random() * 2 * np.pi
        out += amp * env * (0.6 * np.sin(2 * np.pi * fk * t + ph) + 0.4 * np.sin(2 * np.pi * fk * det * t + ph))
    attack = np.minimum(t / 0.006, 1.0)
    # damper: release after the written duration
    rel = np.where(t > dur, np.exp(-(t - dur) / 0.45), 1.0)
    thump = np.exp(-t / 0.012) * rng.standard_normal(n) * 0.015 * vel
    return (out * attack * rel + thump) * vel


def pad(freqs: list[float], dur: float, level: float, rng: np.random.Generator) -> np.ndarray:
    """Warm pad: detuned sine stacks with gentle 2nd/3rd harmonics, slow swell, stereo."""
    n = int((dur + 3.0) * SR)
    t = np.arange(n) / SR
    L = np.zeros(n)
    R = np.zeros(n)
    for i, f in enumerate(freqs):
        w = 0.55 if i == 0 else 1.0  # keep the root light: warmth without low-end weight under the voice
        for d, pan in ((-0.0035, 0.25), (0.0, 0.5), (0.0042, 0.75)):
            ff = f * (1 + d)
            ph = rng.random() * 6.28
            v = np.sin(2 * np.pi * ff * t + ph) + 0.22 * np.sin(2 * np.pi * 2 * ff * t + ph) + 0.07 * np.sin(2 * np.pi * 3 * ff * t)
            L += w * v * (1 - pan)
            R += w * v * pan
    att = np.clip(t / 2.2, 0, 1) ** 1.6
    rel = np.where(t > dur, np.exp(-(t - dur) / 1.2), 1.0)
    env = att * rel * level / (len(freqs) * 3)
    return np.stack([L * env, R * env], axis=1)


# ------------------------------------------------------------------ harmony per scene (one chord per bar)
# Each scene: list of chords; chord = (pad notes, piano bass, arpeggio pool)
CH = {
    "Bm9": (["B2", "F#3", "D4", "C#5"], "B1", ["B3", "D4", "F#4", "C#5"]),
    "Gmaj7": (["G2", "D3", "B3", "F#4"], "G1", ["G3", "B3", "D4", "F#4"]),
    "D/F#": (["F#2", "A3", "D4", "E4"], "F#1", ["D4", "F#4", "A4", "E4"]),
    "Asus": (["A2", "E3", "D4", "E4"], "A1", ["A3", "D4", "E4", "B4"]),
    "A": (["A2", "E3", "C#4", "E4"], "A1", ["A3", "C#4", "E4", "A4"]),
    "Em9": (["E2", "B2", "G3", "F#4"], "E1", ["E3", "G3", "B3", "F#4"]),
    "Dadd9": (["D2", "A2", "F#3", "E4"], "D1", ["D4", "E4", "F#4", "A4"]),
    "F#m7": (["F#2", "C#3", "A3", "E4"], "F#1", ["F#3", "A3", "C#4", "E4"]),
    "A/C#": (["C#3", "E3", "A3", "E4"], "C#2", ["A3", "C#4", "E4", "A4"]),
    "Bm7": (["B2", "F#3", "A3", "D4"], "B1", ["B3", "D4", "F#4", "A4"]),
    "G6": (["G2", "D3", "B3", "E4"], "G1", ["G3", "B3", "D4", "E4"]),
}
SECTIONS = [
    # (chords..., motif?, density 0..1, level)
    {"chords": ["Bm9", "Gmaj7", "D/F#"], "motif": False, "dens": 0.25, "lvl": 0.8},          # 1 uncertainty
    {"chords": ["Gmaj7", "D/F#", "Em9"], "motif": True, "dens": 0.35, "lvl": 0.85},           # 2 discovery
    {"chords": ["G6", "D/F#", "Em9"], "motif": False, "dens": 0.45, "lvl": 0.9},              # 3 coordinator
    {"chords": ["Bm7", "Gmaj7", "Asus"], "motif": False, "dens": 0.45, "lvl": 0.9},           # 4 consultant
    {"chords": ["Gmaj7", "A", "F#m7"], "motif": True, "dens": 0.4, "lvl": 0.95},              # 5 clarity
    {"chords": ["Bm9", "Asus"], "motif": False, "dens": 0.12, "lvl": 0.7},                    # 6 decision — space
    {"chords": ["Dadd9", "A/C#", "Bm7"], "motif": True, "dens": 0.42, "lvl": 0.8},            # 7 appointments
    {"chords": ["Gmaj7", "Dadd9", "Asus"], "motif": False, "dens": 0.42, "lvl": 0.82},         # 8 arrival
    {"chords": ["Em9", "G6", "Dadd9"], "motif": False, "dens": 0.4, "lvl": 0.95},             # 9 care
    {"chords": ["Gmaj7", "Asus", "Dadd9", "Dadd9"], "motif": True, "dens": 0.3, "lvl": 0.9},  # 10 follow-up + logo
]
MOTIF = ["F#4", "A4", "E4", "D4"]


def compose(timing: dict, out: Path) -> None:
    rng = np.random.default_rng(20261017)
    total = timing["total"] + 4.0
    N = int(total * SR)
    mix_p = np.zeros((N, 2))
    mix_pad = np.zeros((N, 2))
    events = []  # for the cue sheet

    def add(buf, sig, at, pan=0.5):
        i = int(at * SR)
        if i >= N:  # a tail that outlasts a short edition is simply dropped
            return
        if sig.ndim == 1:
            sig = np.stack([sig * (1 - pan) * 1.4, sig * pan * 1.4], axis=1)
        if i < 0:  # humanised timing can nudge the very first note before zero
            sig, i = sig[-i:], 0
        j = min(N, i + len(sig))
        buf[i:j] += sig[: j - i]

    for sc in timing["scenes"]:
        sec = SECTIONS[sc["index"] - 1]  # by scene number, so editions get each scene's own harmony
        start, dur = sc["start"], sc["dur"]
        chords = sec["chords"]
        bar = dur / len(chords)
        beat = bar / 4  # nominal 4/4; tempo implied by the scene's length
        for ci, cname in enumerate(chords):
            padn, bass, pool = CH[cname]
            t0 = start + ci * bar
            mix_pad[:] += 0  # keep linter quiet about unused
            add(mix_pad, pad([midi_hz(m(x)) for x in padn], bar + 0.6, 0.11 * sec["lvl"], rng), t0)
            add(mix_p, piano(midi_hz(m(bass)) * 2, bar * 0.95, 0.32 * sec["lvl"], rng), t0, 0.42)
            # sparse arpeggio: density decides how many beats carry a note, seeded and never on every beat
            for b in range(4):
                if b == 0 or rng.random() < sec["dens"]:
                    note = pool[(b + ci) % len(pool)]
                    off = b * beat + (rng.random() - 0.5) * 0.03
                    add(mix_p, piano(midi_hz(m(note)), beat * 1.6, (0.2 + 0.08 * rng.random()) * sec["lvl"], rng), t0 + off, 0.55 + 0.1 * (b % 2))
            events.append({"t": round(t0, 2), "scene": sc["index"], "chord": cname})
        if sec["motif"]:
            # the journey motif enters in the second half of the scene, gently, over the narration's tail
            mt = start + dur * (0.5 if sc["index"] != 10 else 0.62)
            notes = MOTIF if sc["index"] != 5 else ["F#4", "A4", "B4", "A4"]  # clarity: a lift instead of the fall
            if sc["index"] == 7:
                notes = ["A4", "C#5", "B4", "A4"]
            for k, nn in enumerate(notes):
                add(mix_p, piano(midi_hz(m(nn)) * 1.0, 1.4, 0.26, rng), mt + k * 0.62, 0.6)
            events.append({"t": round(mt, 2), "scene": sc["index"], "chord": "motif " + "-".join(notes)})

    # air layer: very quiet band-limited noise that breathes with the sections
    t = np.arange(N) / SR
    noise = rng.standard_normal((N, 2)) * 0.004
    air = Pedalboard([HighpassFilter(1800), LowpassFilter(6000)])(noise.T.astype(np.float32), SR).T
    air *= (0.6 + 0.4 * np.sin(2 * np.pi * t / 23.0))[:, None]

    piano_fx = Pedalboard([HighShelfFilter(cutoff_frequency_hz=4000, gain_db=-5), Reverb(room_size=0.82, damping=0.55, wet_level=0.32, dry_level=0.72, width=0.9)])
    pad_fx = Pedalboard([LowpassFilter(3200), Reverb(room_size=0.9, damping=0.6, wet_level=0.45, dry_level=0.6, width=1.0)])
    p = piano_fx(mix_p.T.astype(np.float32), SR).T
    pd = pad_fx(mix_pad.T.astype(np.float32), SR).T
    music = p + pd * 0.9 + air
    music = Pedalboard([HighpassFilter(70), Compressor(threshold_db=-24, ratio=1.8, attack_ms=40, release_ms=400), Gain(0)])(music.T.astype(np.float32), SR).T
    # fade in/out
    fi = np.clip(t / 2.5, 0, 1)[:, None]
    fo = np.clip((total - t) / 3.5, 0, 1)[:, None]
    music *= fi * fo
    peak = np.max(np.abs(music)) + 1e-9
    music = music / peak * 0.5  # headroom; loudness is set in the mix
    sf.write(out, music.astype(np.float32), SR, subtype="PCM_24")
    out.with_suffix(".events.json").write_text(json.dumps(events, indent=1))
    print(out, round(total, 2), "s")


if __name__ == "__main__":
    compose(json.loads(Path(sys.argv[1]).read_text()), Path(sys.argv[2]))
