"""Derive per-language scene timing from the measured narration.

Picture, captions, music and sound cues all read the same timing file, so each language is cut to its own
voice performance: scene length = max(base length, narration lead-in + line + breathing tail).

Usage: python3 -I tools/build_timing.py en ar
Writes source/data/timing.<lang>.json and source/data/timing.<lang>.js (window.RS_TIMING).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# id, base duration (s), narration lead-in (s) per language, minimum tail after the line (s)
SCENES = [
    {"id": "s01-uncertainty", "line": 1, "base": 11.0, "lead": {"en": 2.7, "ar": 2.2}, "tail": 2.2},
    {"id": "s02-discover", "line": 2, "base": 12.0, "lead": {"en": 1.1, "ar": 1.0}, "tail": 2.4},
    {"id": "s03-coordinator", "line": 3, "base": 12.0, "lead": {"en": 1.5, "ar": 1.4}, "tail": 2.6},
    {"id": "s04-consultant", "line": 4, "base": 12.5, "lead": {"en": 1.3, "ar": 1.3}, "tail": 2.4},
    {"id": "s05-clarity", "line": 5, "base": 12.5, "lead": {"en": 1.6, "ar": 1.6}, "tail": 3.2},
    {"id": "s06-decision", "line": 6, "base": 10.5, "lead": {"en": 2.4, "ar": 2.4}, "tail": 1.6},
    {"id": "s07-appointments", "line": 7, "base": 12.5, "lead": {"en": 1.0, "ar": 1.0}, "tail": 3.0},
    {"id": "s08-arrival", "line": 8, "base": 11.0, "lead": {"en": 1.3, "ar": 1.3}, "tail": 2.6},
    {"id": "s09-care", "line": 9, "base": 12.0, "lead": {"en": 1.2, "ar": 1.2}, "tail": 3.0},
    # scene 10 carries two lines: follow-up, then (after the logo lands) the brand line, then the CTA hold
    {"id": "s10-followup", "line": 10, "line2": 11, "base": 15.5, "lead": {"en": 1.0, "ar": 1.0}, "gap2": 1.6, "tail": 5.2},
]


import re

MAX_CHARS = {"en": 44, "ar": 40}


def balanced(phrase: str, limit: int) -> list[str]:
    """Split a long phrase into near-equal halves at a word boundary (recursively), never leaving a stub."""
    if len(phrase) <= limit:
        return [phrase]
    words = phrase.split()
    best, best_d = 1, 1e9
    for i in range(1, len(words)):
        left, right = " ".join(words[:i]), " ".join(words[i:])
        # prefer breaking before function words and after content words
        d = abs(len(left) - len(right)) + (6 if words[i].lower() in {"can", "the", "a", "and", "of", "to", "your"} else 0)
        # never strand a preposition or article at the end of a caption ("far from | home")
        d += 8 if words[i - 1].lower().strip(",") in {"from", "to", "of", "the", "a", "your", "with", "for", "in", "before", "at"} else 0
        if d < best_d:
            best, best_d = i, d
    return balanced(" ".join(words[:best]), limit) + balanced(" ".join(words[best:]), limit)


def chunk_line(text: str, lang: str) -> list[str]:
    """Split a script line into caption chunks at punctuation first, then by length (keeps phrases whole)."""
    # an ellipsis is a spoken pause: a hard break, never shown ("رحلة شفاء… افهم" → two captions)
    text = text.replace("…", ". ").replace("—", ",").replace(" .", ".").replace("  ", " ").strip()
    parts = [p.strip() for p in re.split(r"(?<=[.,،؛!?؟])\s+", text) if p.strip()]
    out: list[str] = []
    for p in parts:
        # short phrases may join across a comma, never across a sentence end
        if out and not re.search(r"[.!?؟]$", out[-1]) and len(out[-1]) + 1 + len(p) <= MAX_CHARS[lang] * 0.75:
            out[-1] = out[-1] + " " + p
            continue
        out.extend(balanced(p, MAX_CHARS[lang]))
    return out


def caption_times(vo: dict, chunks: list[str]) -> list[dict]:
    """Time chunks by character share across the spoken span, snapped to measured word boundaries."""
    s0, s1 = vo["at"] + vo["speech"][0], vo["at"] + vo["speech"][1]
    total = sum(len(c) for c in chunks)
    bounds = [w["s"] for w in vo["words"]] + [vo["words"][-1]["e"]]
    t, res = s0, []
    for i, c in enumerate(chunks):
        end = s1 if i == len(chunks) - 1 else t + (s1 - s0) * len(c) / total
        if i < len(chunks) - 1:
            end = min(bounds, key=lambda b: abs(b - end))
        res.append({"s": round(t, 3), "e": round(max(end, t + 0.9), 3), "text": c})
        t = end
    for a, b in zip(res, res[1:]):  # a minimum on-screen time must never overlap the next caption
        a["e"] = min(a["e"], b["s"])
    return res


def srt_time(x: float) -> str:
    ms = int(round(x * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def build(lang: str) -> dict:
    lines = {l["line"]: l for l in json.loads((ROOT / f"assets/audio/voiceover/{lang}/lines.json").read_text())["lines"]}
    t = 0.0
    out = []
    for sc in SCENES:
        ln = lines[sc["line"]]
        lead = sc["lead"][lang]
        vo = [{"line": ln["line"], "file": ln["file"], "at": round(lead, 3), "dur": ln["duration"],
               "speech": [ln["speech_start"], ln["speech_end"]], "text": ln["text"],
               "words": [{**w, "s": round(w["s"] + lead, 3), "e": round(w["e"] + lead, 3)} for w in ln["words"]]}]
        end = lead + ln["duration"]
        if "line2" in sc:
            l2 = lines[sc["line2"]]
            at2 = end + sc["gap2"]
            vo.append({"line": l2["line"], "file": l2["file"], "at": round(at2, 3), "dur": l2["duration"],
                       "speech": [l2["speech_start"], l2["speech_end"]], "text": l2["text"],
                       "words": [{**w, "s": round(w["s"] + at2, 3), "e": round(w["e"] + at2, 3)} for w in l2["words"]]})
            end = at2 + l2["duration"]
        dur = round(max(sc["base"], end + sc["tail"]), 2)
        caps = []
        for v in vo:
            for c in caption_times(v, chunk_line(v["text"], lang)):
                caps.append({"s": round(c["s"] + t, 3), "e": round(c["e"] + t, 3), "text": c["text"]})
        out.append({"id": sc["id"], "index": len(out) + 1, "start": round(t, 3), "dur": dur, "vo": vo, "captions": caps})
        t += dur
    return {"lang": lang, "fps": 30, "total": round(t, 2), "scenes": out}


def main() -> None:
    data_dir = ROOT / "source" / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    for lang in sys.argv[1:] or ["en", "ar"]:
        tm = build(lang)
        (data_dir / f"timing.{lang}.json").write_text(json.dumps(tm, ensure_ascii=False, indent=1))
        (data_dir / f"timing.{lang}.js").write_text(
            "window.RS_TIMINGS = window.RS_TIMINGS || {};\nwindow.RS_TIMINGS[" + json.dumps(lang) + "] = "
            + json.dumps(tm, ensure_ascii=False) + ";\n")
        caps = [c for sc in tm["scenes"] for c in sc["captions"]]
        sub_dir = ROOT / "subtitles"
        sub_dir.mkdir(exist_ok=True)
        rtl = "\u202b" if lang == "ar" else ""
        (sub_dir / f"rehletshifaa_master_{lang}.srt").write_text("\n".join(
            f"{i + 1}\n{srt_time(c['s'])} --> {srt_time(c['e'])}\n{rtl}{c['text']}\n" for i, c in enumerate(caps)), encoding="utf-8")
        print(lang, tm["total"], [s["dur"] for s in tm["scenes"]], len(caps), "captions")


if __name__ == "__main__":
    main()
