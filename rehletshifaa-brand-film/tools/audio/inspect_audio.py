"""Instrumented listening: loudness, true peak, short-term loudness curve, spectral balance, clicks, spectrogram.

This is the objective half of audio QA. It cannot judge taste; a human listening pass is still required.
Usage: python3 -I tools/audio/inspect_audio.py <file.wav> [png]
"""
from __future__ import annotations

import json
import sys

import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from scipy.signal import resample_poly, stft


def true_peak_db(x: np.ndarray) -> float:
    up = resample_poly(x, 4, 1, axis=0)
    return float(20 * np.log10(np.max(np.abs(up)) + 1e-12))


def report(path: str, png: str | None = None) -> dict:
    x, sr = sf.read(path, always_2d=True)
    meter = pyln.Meter(sr)
    lufs = meter.integrated_loudness(x)
    st = []
    win, hop = int(3 * sr), int(1 * sr)
    for i in range(0, max(1, len(x) - win), hop):
        seg = x[i:i + win]
        v = meter.integrated_loudness(seg) if np.max(np.abs(seg)) > 1e-5 else -99
        st.append(round(v, 1))
    mono = x.mean(axis=1)
    f, t, Z = stft(mono, sr, nperseg=4096, noverlap=2048)
    mag = np.abs(Z)
    bands = {"sub<60": (0, 60), "low60-250": (60, 250), "mid250-2k": (250, 2000), "pres2k-6k": (2000, 6000), "air>6k": (6000, sr / 2)}
    tot = (mag ** 2).sum() + 1e-12
    bal = {k: round(10 * np.log10((mag[(f >= a) & (f < b)] ** 2).sum() / tot + 1e-12), 1) for k, (a, b) in bands.items()}
    d = np.abs(np.diff(mono))
    thr = np.median(d) * 60 + 1e-4
    clicks = np.where(d > max(thr, 0.25))[0]
    out = {"file": path, "dur": round(len(x) / sr, 2), "lufs_i": round(lufs, 1), "true_peak_dbtp": round(true_peak_db(x), 2),
           "st_lufs_max": max(st), "st_lufs_min_active": min([v for v in st if v > -70] or [-99]), "band_balance_db": bal,
           "click_candidates": int(len(clicks)), "click_times": [round(c / sr, 3) for c in clicks[:10]], "short_term_3s": st}
    if png:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        fig, ax = plt.subplots(2, 1, figsize=(16, 7), sharex=True)
        ax[0].pcolormesh(t, f, 20 * np.log10(mag + 1e-9), shading="auto", vmin=-110, vmax=-20, cmap="magma")
        ax[0].set_ylim(20, 12000); ax[0].set_yscale("log"); ax[0].set_ylabel("Hz")
        ax[1].plot(np.arange(len(st)) + 1.5, st); ax[1].set_ylabel("ST LUFS (3s)"); ax[1].grid(alpha=.3)
        fig.tight_layout(); fig.savefig(png, dpi=80); plt.close(fig)
    return out


if __name__ == "__main__":
    r = report(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
    print(json.dumps({k: v for k, v in r.items() if k != "short_term_3s"}, indent=1))
    print("ST:", r["short_term_3s"])
