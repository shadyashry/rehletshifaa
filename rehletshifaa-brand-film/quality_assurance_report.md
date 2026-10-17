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
