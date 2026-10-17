# Quality assurance report

There were two QA passes on **rendered files**: frames extracted from the MP4s with ffmpeg, and loudness measured on the encoded AAC. During production, every scene was also checked in EN and AR from frame contact sheets (`tools/frames.mjs`) before it was accepted.

## QA pass 1: first rendered masters (v1)

**Files:** `rehletshifaa_master_{en,ar}_1080p.mp4` as first rendered.

| Check | EN | AR | Result |
|---|---|---|---|
| Video | H.264 High, 1920×1080, 30 fps, yuv420p, about 2.4 Mb/s | same, about 2.2 Mb/s | ✅ |
| Audio | AAC-LC 48 kHz stereo, about 196 kb/s | same | ✅ |
| Duration | 123.27 s (timing 123.24 s) | 124.43 s (timing 124.42 s) | ✅ |
| Integrated loudness (encoded) | −16.0 LUFS | −16.0 LUFS | ✅ target ≈ −16 |
| True peak (encoded) | −1.2 dBTP | −1.1 dBTP | ✅ ≤ −1 |
| Loudness range | 17.3 LU | 16.7 LU | ⚠️ wide (see note) |
| Fonts in render (Alexandria, Jakarta, Cairo) | ✅ | ✅ (Arabic shaping correct) | ✅ |
| RTL: UI mirrored, reading-order motion, captions | — | ✅ | ✅ |

### Defects found and fixed
| # | Defect | Severity | Fix |
|---|---|---|---|
| 1 | Scene 6 insert (both languages): the camera framed the estimate range large while the "Non-binding…" note was cut off at the frame edge | **High** (claims rule) | Reframed (`s06.js`): the insert now holds the whole estimate card, range plus full note, then the actions |
| 2 | Scene 2 AR: the RTL title (top-right) overlapped the phone | Medium | `RS.TITLE_FLIP_RTL`: this scene's Arabic title sits at the left margin; its rail still fills right to left |
| 3 | Captions: brand and tagline chunks overlapped in time; the AR brand name merged into the tagline caption; "far from \| home" stranded a preposition | Low | `build_timing.py`: an ellipsis is a hard break, no merge across sentence ends, overlap clamp, preposition penalty. Burned captions are suppressed over the end card, which shows the words itself |
| 4 | Vertical edition: the scene 6 insert could show the range in a square crop without its note | **High** (claims rule) | The vertical layout adds a large-type chip "Preliminary estimate · Non-binding. The final quote follows your in-person assessment." whenever the estimate is on screen (scenes 5 and 6) |

Scene timing was unchanged by these fixes, and the cue dumps were byte-identical, so the v1 mixes remain valid for v2.

### Notes, not defects
- **Loudness range 16–17 LU.** This is the quiet pauses between narration lines, where only the soft score plays (short-term about −33 LUFS), against narration at about −15. It is intentional, but on phone speakers the pauses will feel very quiet. If a tighter range is preferred, raise `--music-target` toward −27 in the mixer, which shrinks the range by about 2 LU at a small cost to speech separation.
- **Click scan.** It flags transients inside spoken consonants only. All non-speech stems report 0 (`audio_mixing_report.md`).

## QA pass 2: final renders

**Method.** Each file was checked from the MP4 itself:

- ffprobe for streams and duration;
- ffmpeg `ebur128=peak=true` on the encoded AAC;
- `blackdetect` across the whole file;
- frames extracted at each scene or segment, kept as contact sheets in `review/frames/`.

| File | Video | Duration | Integrated | True peak | LRA | Black frames | Picture check |
|---|---|---|---|---|---|---|---|
| `rehletshifaa_master_en_1080p.mp4` | H.264 1920×1080 30 fps + AAC 48 kHz | 123.27 s | −16.0 LUFS | −1.2 dBTP | 17.3 LU | 0 | ✅ fixes 1 and 3 verified |
| `rehletshifaa_master_ar_1080p.mp4` | same | 124.43 s | −16.0 LUFS | −1.1 dBTP | 16.7 LU | 0 | ✅ fixes 1, 2 and 3 verified |
| `rehletshifaa_patient_en_9x16.mp4` | H.264 1080×1920 30 fps + AAC | 38.33 s | −16.0 LUFS | −1.2 dBTP | 5.2 LU | 0 | ✅ estimate chip present wherever the range is shown |
| `rehletshifaa_patient_ar_9x16.mp4` | same | 39.33 s | −16.0 LUFS | −2.9 dBTP | 4.0 LU | 0 | ✅ RTL, chip, AR CTA and URL |
| `rehletshifaa_business_en_16x9.mp4` | H.264 1920×1080 30 fps + AAC | 40.23 s | −16.0 LUFS | −1.9 dBTP | 3.2 LU | 0 | ✅ role order: coordinator → consultant → plan → care → brand |
| `rehletshifaa_business_ar_16x9.mp4` | same | 41.83 s | −16.0 LUFS | −1.4 dBTP | 3.0 LU | 0 | ✅ |

The edition lengths are inside the brief's ranges: patient 30–45 s and business 35–45 s.

### Claims audit (all six films)
- **Estimate.** It is shown only as a range ("USD 3,900 – 5,400", labelled "Illustrative example"), always with "Non-binding. The final quote follows your in-person assessment." in frame, or with the large-type chip in the vertical edition. ✅
- **Final plan.** It appears only after the in-person assessment ("Confirmed after in-person assessment"). ✅
- **Travel.** It is optional and only after the decision: appointments are confirmed first, and only the services the patient chose are ticked. ✅
- **No promises or ownership.** There are no outcome guarantees and no hospital ownership; clinical decisions belong to the "treating team". ✅
- **No real data.** No real patient data appears. ✅

## Honest limitations (open)
1. **Style.** The characters are refined editorial vector, not painterly semi-realism. No image-generation service was available. Acting depth comes from the rig: gaze, blinks, breath, hands, anticipation and settle.
2. **Native listening.** Narration was verified by Whisper round-trip, not yet by native listeners. AR lines 1, 3, 4, 6, 7 and 9 should be checked for سـ/صـ articulation.
3. **Licence.** The ElevenLabs narration and sound effects may come from a free-tier workspace; regenerate them under a paid plan before public use (`licensing_record.md`).
4. **Masters' LRA.** At 16–17 LU it is wide by design (quiet score between lines). The edits measure 3–5 LU. Raise `--music-target` if a tighter master is wanted.
5. **Dense UI in the vertical edition.** Phone-sized legibility is solved with chips and captions rather than a full vertical re-layout of the proposal screen.
