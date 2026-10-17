"""Split a continuous narration take into per-scene WAV lines using Whisper word timestamps.

Usage: python3 -I tools/split_narration.py <lang> <take.mp3> <out_dir>

Writes <out_dir>/line_XX.wav (48 kHz mono, 24-bit) and <out_dir>/lines.json with each line's text, duration,
word timings (relative to the line) and round-trip WER — the production QA record for pronunciation.
"""
from __future__ import annotations

import difflib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from faster_whisper import WhisperModel

LINES = {
    "en": [
        "When your health needs answers, finding the right care far from home can feel overwhelming.",
        "With RehletShifaa, you can begin with the medical information you already have. Your journey starts with a simple step.",
        "A dedicated Patient Coordinator organizes your case, helps with the next steps, and remains your main point of contact.",
        "A verified Consultant, selected for your medical needs, carefully reviews the information and recommends appropriate next steps.",
        "You understand the recommendation, the next steps, and preliminary costs before deciding whether to continue.",
        "The decision is yours. When you're ready, we help organize what comes next.",
        "If you continue your care in Egypt, we coordinate your medical appointments first, then the practical travel arrangements you need.",
        "From arrival to appointments, your coordination team helps keep the practical details organized.",
        "Your treating team confirms the appropriate care plan, while your Coordinator stays connected throughout the agreed journey.",
        "And after you return home, we help coordinate your agreed follow-up.",
        "RehletShifaa. Understand your options before you travel.",
    ],
    "ar": [
        "حين تحتاج صحتُك إلى إجابات، قد يبدو البحثُ عن الرعاية المناسبة بعيدًا عن بيتك… أمرًا مُرهِقًا.",
        "مع رحلة شفاء، تبدأ بما لديك من معلوماتٍ طبية. خطوةٌ بسيطة… تبدأ بها رحلتك.",
        "منسّقُ حالةٍ مخصّصٌ لك يرتّب ملفّك، ويرافقك في الخطوات التالية، ويبقى نقطةَ تواصلك الأساسية.",
        "ويُختار لحالتك استشاريٌّ موثَّق وفق احتياجك الطبي، فيراجع معلوماتك بعناية… ويوصي بالخطوات المناسبة.",
        "تفهم التوصية، والخطوات التالية، والتكلفة المبدئية… قبل أن تقرّر المتابعة.",
        "القرارُ قرارُك. وعندما تختار المضيَّ قُدُمًا، نساعدك في ترتيب ما يلي.",
        "وإن اخترت متابعة رعايتك في مصر، ننسّق مواعيدك الطبية أولًا… ثم ترتيبات السفر العملية التي تحتاجها.",
        "من لحظة وصولك وحتى مواعيدك، يساعدك فريق التنسيق على تنظيم التفاصيل العملية.",
        "يؤكّد فريقُك المعالج خطةَ الرعاية المناسبة، بينما يبقى منسّقك على تواصلٍ معك طوال الرحلة المتفق عليها.",
        "وبعد عودتك إلى بيتك، نساعدك في تنسيق المتابعة المتفق عليها.",
        "رحلة شفاء… افهم خيارات علاجك قبل أن تسافر.",
    ],
}
AR_DIAC = re.compile(r"[ً-ْٰـ]")


def norm(word: str, lang: str) -> str:
    w = word.lower()
    if lang == "ar":
        w = AR_DIAC.sub("", w)
        w = re.sub("[إأآا]", "ا", w).replace("ى", "ي").replace("ة", "ه")
    w = re.sub(r"[^\w]", "", w)
    return {"rehletshifaa": "rehlet", "shifa": "shifaa", "shifaa": "shifaa"}.get(w, w)


def tokens(text: str, lang: str) -> list[str]:
    text = text.replace("RehletShifaa", "Rehlet Shifaa")
    return [t for t in (norm(w, lang) for w in re.split(r"[\s—…]+", text)) if t]


def main() -> None:
    lang, take, out = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as td:
        wav = Path(td) / "take.wav"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(take), "-ac", "1", "-ar", "48000", str(wav)], check=True)
        audio, sr = sf.read(wav)
        w16 = Path(td) / "w16.wav"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(take), "-ac", "1", "-ar", "16000", str(w16)], check=True)
        a16, _ = sf.read(w16)
    model = WhisperModel("medium", device="cpu", compute_type="int8")
    segs, _ = model.transcribe(a16.astype(np.float32), language=lang, word_timestamps=True, beam_size=5,
                               initial_prompt="RehletShifaa, Rehlet Shifaa, رحلة شفاء")
    words = [w for s in segs for w in (s.words or [])]
    hyp = [norm(w.word, lang) for w in words]

    ref, ref_line = [], []
    for i, line in enumerate(LINES[lang]):
        tk = tokens(line, lang)
        ref += tk
        ref_line += [i] * len(tk)
    sm = difflib.SequenceMatcher(a=ref, b=hyp, autojunk=False)
    first: dict[int, int] = {}
    last: dict[int, int] = {}
    for a0, b0, n in sm.get_matching_blocks():
        for k in range(n):
            li = ref_line[a0 + k]
            first.setdefault(li, b0 + k)
            first[li] = min(first[li], b0 + k)
            last[li] = max(last.get(li, -1), b0 + k)

    # line spans from matched words, then extend to include unmatched words between consecutive spans
    spans = []
    for i in range(len(LINES[lang])):
        if i not in first:
            raise SystemExit(f"line {i + 1} not found in transcript")
        spans.append([first[i], last[i]])
    for i in range(len(spans) - 1):
        gap_words = range(spans[i][1] + 1, spans[i + 1][0])
        for j in gap_words:  # assign stray words to the nearer line in time
            if words[j].start - words[spans[i][1]].end < words[spans[i + 1][0]].start - words[j].end:
                spans[i][1] = j
            else:
                spans[i + 1][0] = min(spans[i + 1][0], j)

    meta = []
    n = len(audio)
    env = np.convolve(np.abs(audio), np.ones(480) / 480, mode="same")
    for i, (s0, s1) in enumerate(spans):
        t0, t1 = words[s0].start, words[s1].end
        # cut points: quietest 10 ms within ±0.25 s outside the speech span, padded by breath room
        def quiet(lo: float, hi: float) -> float:
            a, b = max(0, int(lo * sr)), min(n, int(hi * sr))
            if b - a < 480:
                return lo
            return (a + int(np.argmin(env[a:b]))) / sr
        prev_end = words[spans[i - 1][1]].end if i else 0.0
        next_start = words[spans[i + 1][0]].start if i + 1 < len(spans) else n / sr
        c0 = quiet(max(prev_end, t0 - 0.35), t0 - 0.02) if i else max(0.0, t0 - 0.12)
        c1 = quiet(t1 + 0.04, min(next_start, t1 + 0.5))
        seg = audio[int(c0 * sr):int(c1 * sr)].copy()
        fade = int(0.012 * sr)
        seg[:fade] *= np.linspace(0, 1, fade)
        seg[-fade:] *= np.linspace(1, 0, fade)
        sf.write(out / f"line_{i + 1:02d}.wav", seg, sr, subtype="PCM_24")
        line_words = [{"w": words[k].word.strip(), "s": round(words[k].start - c0, 3), "e": round(words[k].end - c0, 3)}
                      for k in range(s0, s1 + 1)]
        r_tok = tokens(LINES[lang][i], lang)
        h_tok = [norm(words[k].word, lang) for k in range(s0, s1 + 1)]
        ratio = difflib.SequenceMatcher(a=r_tok, b=[h for h in h_tok if h]).ratio()
        meta.append({
            "line": i + 1, "text": LINES[lang][i], "file": f"line_{i + 1:02d}.wav",
            "duration": round(len(seg) / sr, 3), "speech_start": round(t0 - c0, 3), "speech_end": round(t1 - c0, 3),
            "transcript": " ".join(w["w"] for w in line_words), "token_match": round(ratio, 3), "words": line_words,
        })
        print(f"{i + 1:2d} {len(seg) / sr:6.2f}s match={ratio:.2f} | {meta[-1]['transcript']}")
    (out / "lines.json").write_text(json.dumps({"lang": lang, "source": take.name, "lines": meta}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
