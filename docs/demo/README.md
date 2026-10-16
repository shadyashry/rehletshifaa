# RehletShifaa platform demo

A guided click-through of one demo case, from the public home page to follow-up, with **Arabic voice-over** over **English screens**. One static page, no build, works offline.

**Open:** double-click `docs/demo/index.html` (keep the `assets/` folder beside it). Use Next/Back, the ← → keys and select a numbered point in the sidebar to replay its highlight. **Play with Arabic voice-over** plays the narration clip for each step and moves on by itself. Works down to 390px wide.

**Video:** `journey.mp4` (1080p, about 5.8 min, 15 MB): the same walkthrough with the Arabic voice-over, no subtitles. Picture and audio are cut to the same slide lengths.

## Steps (14)
Opening (the seven care-journey stages and three principles), then:
1 Home page · 2 Sending the case (3-step form) · 3 Case received (secure status page) · 4 Coordinator My work · 5 Preparing the case · 6 Consultant review · 7 Preliminary estimate · 8 One-time code · 9 Coordination deposit · 10 Deposit confirmed · 11 Admission and voucher · 12 Treatment milestones · 13 Discharge pack · 14 Follow-up. Then a swimlane summary (Patient / Coordinator / Consultant) and "Not shown yet".

Steps 11 to 14 show the Consultant's view of the case file. There are no mock slides: every screen is a real capture.

## Screens
Captured on 2026-10-17 from the running dev build (review-p0 at 833df27) with `tools/demo-shots.spec.ts`: the repository's synthetic fixtures (demo data, no real sign-in) against `http://localhost:3000`, 1440px wide, then cropped to the relevant panel and saved as WebP in `assets/`. To refresh them after UI changes, copy the spec into `frontend/e2e/`, run it with `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_API_BASE_URL` and `PLAYWRIGHT_OIDC_AUTHORITY` set to match the build, and re-crop (`tools/procnew.py`).

## Highlights
Key fields get a one-second flash: a logo-coral (`#e07a5f`) border, transparent inside, that fades out by itself. The home page has none. In the video the same flashes are timed across each narration with ffmpeg overlays (`tools/frames.js`, `tools/mkov.py`, `tools/build_video.py`).

## Voice-over
`narration-ar.json` holds the Arabic script (Modern Standard Arabic). The clips in `assets/audio/` were generated with the neural voice `ar-EG-SalmaNeural` (Microsoft Edge text-to-speech, via the `edge-tts` package), so the script text was sent to that service. The script has not had a native-speaker review yet; the same text appears under "Arabic voice-over text" on each step. To change the wording, edit the JSON, rerun `tools/tts.py`, then re-inject the text into `index.html`.

## Privacy and copy rules
Names that were not obvious demo data (coordinator, Consultant and hospital names) are blurred. Remaining names are demo data. Bank details are the dummy values from the UI. The one-time code is never shown. Costs are shown only as in the screens and described as estimates.

## Not shown yet
- The final quote, and the patient's own outcome questionnaire.
- An Arabic interface (the voice-over is Arabic; the screens are English).

Fonts: the page asks for Alexandria and Plus Jakarta Sans and falls back to system fonts when they are not installed. Colours follow the Petrol & Paper tokens in `DESIGN.md`.
