# RehletShifaa platform demo

A guided click-through of one demo case, from the public home page to follow-up, with **Arabic voice-over** over **English screens**. One static page, no build, works offline.

**Open:** double-click `docs/demo/index.html` (keep the `assets/` folder beside it). Use Next/Back, the ← → keys and select a numbered point in the sidebar to replay its highlight. **Play with Arabic voice-over** plays the narration clip for each step and moves on by itself. Works down to 390px wide.

**Video:** `journey.mp4` (1080p, about 4.7 min): the same walkthrough with the Arabic voice-over, no subtitles. Picture and audio are cut to the same slide lengths.

## Steps (17)
Cinematic opening (about 16 seconds, no slide text to read): the real logo (captured from the live site on transparent, true colours) on the paper theme, a plane flying the seven care-journey stages, three animated cards (reviewed by a highly experienced Consultant, one multilingual coordinator, cost estimate), then "One case. One journey." The motion runs from CSS timings (`--s` start time per element), so the page and the video use the same animation. Then:
1 Home page (the live hero animation plays) · 2 Sending the case · 3 Case received · 4 Coordinator My work · 5 Preparing the case (two dummy eligible Consultants) · 6 Reviewed by a Consultant (motion: one highly experienced specialist) · 7 Consultant review · 8 Preliminary estimate · 9 One-time code · 10 Coordination deposit · 11 Our finance team (motion: invoices and transfers are checked) · 12 Deposit confirmed · 13 Travel and stay (motion: flights, visa support, hotel through our operators) · 14 Admission and voucher · 15 Treatment milestones ("Countersign" is explained: the Consultant signs off the milestone) · 16 Discharge pack · 17 Follow-up. Then a swimlane summary (Patient / Coordinator / Consultant / Support team) and "Not shown yet".

Steps 14 to 17 show the Consultant's view of the case file. Steps 6, 11 and 13 are illustrative animations, not screenshots; every other screen is a real capture.

## Screens
Captured on 2026-10-17 from the running dev build (review-p0 at 833df27) with `tools/demo-shots.spec.ts`: the repository's synthetic fixtures (demo data, no real sign-in; the spec also adds two dummy eligible Consultants, Dr Samir Example and Dr Nadia Example, to the coordinator screen) against `http://localhost:3000`, 1440px wide, then cropped to the relevant panel and saved as WebP in `assets/`. To refresh them after UI changes, copy the spec into `frontend/e2e/`, run it with `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_API_BASE_URL` and `PLAYWRIGHT_OIDC_AUTHORITY` set to match the build, and re-crop (`tools/procnew.py`).

## Highlights
Key fields get a one-second flash: a logo-coral (`#e07a5f`) border, transparent inside, that fades out by itself. The home page has none (its own hero animation plays instead: `assets/hero.mp4`, a recording of the live page made with `tools/record-hero.js`). In the video the same flashes are timed across each narration with ffmpeg overlays (`tools/frames.js`, `tools/build_video.py`).

## Voice-over
`narration-ar.json` holds the Arabic script, written in Modern Standard Arabic. The clips in `assets/audio/` were generated with the neural voice `ar-EG-SalmaNeural` (Microsoft Edge text-to-speech, via the `edge-tts` package), so the script text was sent to that service. The script has not had a native-speaker review yet; the same text appears under "Arabic voice-over text" on each step. To change the wording, edit the JSON, rerun `tools/tts.py`, then re-inject the text into `index.html`.

## Privacy and copy rules
Names that were not obvious demo data (coordinator, Consultant and hospital names) are blurred. Remaining names are demo data. Bank details are the dummy values from the UI. The one-time code is never shown. Costs are shown only as in the screens and described as estimates.

## Not shown yet
- The final quote, and the patient's own outcome questionnaire.
- An Arabic interface (the voice-over is Arabic; the screens are English).

Fonts: the page asks for Alexandria and Plus Jakarta Sans and falls back to system fonts when they are not installed. Colours follow the Petrol & Paper tokens in `DESIGN.md`.

## Motion inside the slides
Every screenshot slide moves: a cursor travels to each highlighted element and clicks (a ripple), the element gets a one-second coral border flash, stamps slam into place (Received, Estimate ready), and masked dots type into the one-time-code field (never a real code). All of it is CSS keyed to start times, so the page and the video share one animation. Video frames are rendered by `tools/frames.js` and assembled by `tools/build_video.py`.

## Music
`assets/audio/music.mp3` is a calm ambient bed synthesised for this demo (soft pads and sparse bell notes, no third-party material; `tools/music.py`). In the video it sits well under the voice and is ducked while the voice speaks. On the page it plays quietly during "Play with Arabic voice-over".
