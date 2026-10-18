"""Objective audition metrics: Whisper round-trip intelligibility + prosody.

These metrics support — they do not replace — a human listening sign-off.
"""
from __future__ import annotations
import json, re, sys, subprocess, tempfile
from pathlib import Path
import numpy as np, soundfile as sf, pyloudnorm as pyln
from faster_whisper import WhisperModel

SCRIPTS = {
    "en": "When your health needs answers, finding the right care far from home can feel overwhelming. "
          "With Rehlet Shifaa, a verified Consultant carefully reviews your medical reports and you understand "
          "the recommendation, the next steps, and preliminary costs before deciding whether to continue.",
    "ar": "حين تحتاج صحتك إلى إجابات قد يبدو البحث عن الرعاية المناسبة بعيدا عن بيتك أمرا مرهقا "
          "مع رحلة شفاء يراجع استشاري موثق تقاريرك الطبية بعناية لتفهم التوصية والخطوات التالية "
          "والتكلفة المبدئية قبل أن تقرر المتابعة",
}
AR_DIAC = re.compile(r"[ً-ْٰـ]")

def norm(t: str, lang: str) -> list[str]:
    t = t.lower()
    if lang == "ar":
        t = AR_DIAC.sub("", t)
        t = re.sub("[إأآا]", "ا", t).replace("ى", "ي").replace("ة", "ه")
    t = re.sub(r"[^\w\s]", " ", t)
    t = t.replace("rehletshifaa", "rehlet shifaa").replace("shifa ", "shifaa ")
    return t.split()

def wer(ref: list[str], hyp: list[str]) -> float:
    d = np.zeros((len(ref) + 1, len(hyp) + 1), dtype=int)
    d[:, 0] = range(len(ref) + 1); d[0, :] = range(len(hyp) + 1)
    for i in range(1, len(ref) + 1):
        for j in range(1, len(hyp) + 1):
            d[i, j] = min(d[i-1, j] + 1, d[i, j-1] + 1, d[i-1, j-1] + (ref[i-1] != hyp[j-1]))
    return d[-1, -1] / max(1, len(ref))

def f0_track(x: np.ndarray, sr: int) -> np.ndarray:
    """Autocorrelation pitch per 40 ms frame, voiced frames only (75–400 Hz)."""
    hop, win = int(sr * .01), int(sr * .04); out = []
    for s in range(0, len(x) - win, hop):
        f = x[s:s+win] * np.hanning(win)
        if np.sqrt(np.mean(f**2)) < 0.01: continue
        ac = np.correlate(f, f, "full")[win-1:]
        lo, hi = int(sr / 400), int(sr / 75)
        k = lo + int(np.argmax(ac[lo:hi]))
        if ac[k] / (ac[0] + 1e-9) > 0.45: out.append(sr / k)
    return np.array(out)

def analyze(path: Path, model: WhisperModel) -> dict:
    lang = path.name[:2]
    with tempfile.TemporaryDirectory() as td:
        wav = Path(td) / "a.wav"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(path), "-ac", "1", "-ar", "16000", str(wav)], check=True)
        x, sr = sf.read(wav)
    segs, _ = model.transcribe(x.astype(np.float32), language=lang, word_timestamps=True, beam_size=5)
    words = [w for s in segs for w in (s.words or [])]
    text = " ".join(w.word.strip() for w in words)
    gaps = [b.start - a.end for a, b in zip(words, words[1:])]
    speech = sum(w.end - w.start for w in words)
    f0 = f0_track(x, sr)
    semis = 12 * np.log2(f0 / np.median(f0)) if len(f0) else np.array([0])
    return {
        "take": path.stem, "duration_s": round(len(x) / sr, 2),
        "words_per_min": round(60 * len(words) / max(1e-6, words[-1].end - words[0].start), 1) if words else 0,
        "pauses_over_300ms": int(sum(g > .3 for g in gaps)), "longest_pause_s": round(max(gaps, default=0), 2),
        "speech_ratio": round(speech / (len(x) / sr), 2),
        "f0_median_hz": round(float(np.median(f0)), 1) if len(f0) else None,
        "pitch_range_semitones_p5_p95": round(float(np.percentile(semis, 95) - np.percentile(semis, 5)), 2),
        "lufs": round(pyln.Meter(sr).integrated_loudness(x), 1), "peak_dbfs": round(20 * np.log10(np.max(np.abs(x)) + 1e-9), 1),
        "wer_vs_script": round(float(wer(norm(SCRIPTS[lang], lang), norm(text, lang))), 3), "transcript": text,
    }

if __name__ == "__main__":
    folder = Path(sys.argv[1]); model = WhisperModel(sys.argv[2] if len(sys.argv) > 2 else "small", device="cpu", compute_type="int8")
    rows = [analyze(p, model) for p in sorted(folder.glob("*.mp3"))]
    (folder / "audition_metrics.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2))
    for r in rows: print({k: v for k, v in r.items() if k != "transcript"}); print("   ", r["transcript"])
