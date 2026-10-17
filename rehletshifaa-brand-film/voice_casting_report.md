# Voice casting report

**Engine:** ElevenLabs `eleven_v4` (text-to-speech), via the ElevenLabs connector, run strictly one generation at a time.
**Audition segment:** the same opening passage for every voice in each language (scene 1 + the start of scene 2):

- EN: *"When your health needs answers, finding the right care far from home can feel overwhelming. With RehletShifaa, a verified consultant carefully reviews your medical reports, and you understand the recommendation, the next steps, and preliminary costs before deciding whether to continue."*
- AR: *"حين تحتاج صحتك إلى إجابات، قد يبدو البحث عن الرعاية المناسبة بعيدًا عن بيتك أمرًا مرهقًا. مع رحلة شفاء، يراجع استشاري موثَّق تقاريرك الطبية بعناية، لتفهم التوصية والخطوات التالية والتكلفة المبدئية قبل أن تقرر المتابعة."*

**Files:** `assets/audio/voiceover/auditions/*.mp3`. Raw metrics are in `audition_metrics.json`, produced by `tools/analyze_auditions.py`.

## How the takes were scored — and what this does not cover

Every take was measured, not judged by ear:

| Measure | How |
|---|---|
| Intelligibility | Word error rate (WER) of a faster-whisper `medium` transcript against the script |
| Brand pronunciation | Whether the transcript recovers "RehletShifaa" / "رحلة شفاء" |
| Pace | Words per minute, plus pauses over 300 ms |
| Expressiveness proxy | F0 median and the p5–p95 pitch range in semitones |
| Technical | Integrated LUFS and sample peak |

**Limitation, stated plainly:** these numbers cannot judge warmth, timbre, sincerity or accent naturalness. The selection below is the best-measured candidate. A native-speaker listening pass (one EN, one AR) is still required before public release. It is listed as an open item in `quality_assurance_report.md`.

### Scores

Each criterion is scored 1–5 and derived from the metrics; the total is out of 25.

| Take | Voice ID | WER | Brand heard as | WPM | Pitch range (st) | LUFS / peak | Clarity | Brand | Pace | Expression | Tech | **Total** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| en_cherine_t1 | `eiNgkRczHJmif3gxSoyz` | 0.0% | "Rehlet Shifa" ✓ | 135 | 12.6 | −22.2 / −5.3 | 5 | 5 | 4 | 5 | 5 | **24** |
| en_cherine_t2 | (same) | 2.4% | "Rehlat Shifa" | 138 | 12.4 | −21.9 / −5.4 | 5 | 4 | 4 | 5 | 5 | 23 |
| en_julie_t1 | `g12yXXabMWeFoLMzxPrF` | 4.8% | "Relit Shafa" ✗ | 114 | 9.8 | −17.5 / −1.3 | 4 | 2 | 5 | 3 | 3 | 17 |
| en_julie_t2 | (same) | 4.8% | "Rehlat Shafa" ✗ | 114 | 10.3 | −19.2 / −2.8 | 4 | 2 | 5 | 4 | 3 | 18 |
| en_marilyn_t1–t4 | `CH8NA3Iu30hBBcNIzv9I` | 2.4–4.8% | "Relat / Raylette / Relet" ✗ | 106–116 | 3.2–9.6 | ≈ −42 / −27 | 4 | 1 | 5 | 2 | 1 | 13 |
| **ar_razan_t1** | `EUojVLG1QfxaqqH4ce6s` | **0.0%** | "رحلة شفاء" ✓ | 124 | 12.8 | −23.8 / −6.8 | 5 | 5 | 3 | 5 | 5 | **23** |
| ar_wiam_t1 | `R5kMoWNNTn84ezIJA53m` | 5.7% | "رحلة شفاء" ✓ | 82 | 9.5 | −25.8 / −9.9 | 4 | 5 | 3 | 3 | 4 | 19 |
| ar_heba_t1 | `v7UCHHCrHj1KBa4E41gb` | 48.6% | "رحلة شفا" | 81 | 10.5 | −28.6 / −8.7 | 1 | 3 | 3 | 3 | 3 | 13 |

Marilyn's level ran about 20 dB below the others in every take. That is a generation-level fault, not a gain choice, and it costs the technical score.

## Decisions

- **English narrator: Cherine Hani (`eiNgkRczHJmif3gxSoyz`).**
  - Only voice to say the brand name correctly in both takes.
  - Verbatim transcript and the widest natural pitch range: warm, not flat.
  - Clean level with headroom.
- **Arabic narrator: Razan (`EUojVLG1QfxaqqH4ce6s`).**
  - Verbatim, with "رحلة شفاء" correct.
  - Brisk on the audition (124 wpm, no pauses). The master take was therefore directed with punctuation pauses, and every scene is re-timed to the Arabic narration rather than the English one.
  - Runner-up: Wiam (`R5kMoWNNTn84ezIJA53m`), slower and softer.
- **Not used:** no voice cloning of any real person.

## Master narration takes

| Language | Take | Duration | Lines | Round-trip QA (Whisper token match per line) |
|---|---|---|---|---|
| EN | `voiceover/en/raw/en_master_take1.mp3` | 78.99 s | 11 | 1.00 on every line. Line 10 reads 0.87 only because Whisper normalises "follow-up". |
| AR | `voiceover/ar/raw/ar_master_take1.mp3` | 76.08 s | 11 | 0.88–1.00 |

AR lines 1, 3, 4, 6, 7 and 9 are flagged for the native-ear check:

- The transcript confuses سـ/صـ in صحتك and منسّق.
- These are typical Whisper confusions, but they must be confirmed by a listener.

Each take was split into per-line 48 kHz/24-bit files (`line_01..11.wav`) with word timings (`lines.json`) by `tools/split_narration.py`. Scene timing is derived from those words.

## Licensing note

The ElevenLabs workspace used here appeared to be on a free tier ("Free Tier access has been disabled" errors under parallel load). ElevenLabs' free tier does not grant a commercial licence. **Before any public or commercial use, regenerate or confirm the narration under a paid ElevenLabs plan with commercial rights.** See `licensing_record.md`.
