# RehletShifaa platform demo

A Supademo-style click-through of one demo case. One static page, no build, works offline.

**Open:** double-click `docs/demo/index.html` (images load from `assets/`, so keep the folder beside it). Use the Next/Back buttons, the ← → keys, or click a pulsing ring. Layout works down to 390px wide.

## Steps
Opening slide, then 12 steps, then a closing timeline. Role chips: Patient / Coordinator / Consultant.

| # | Step | Source (all under `docs/ux-redesign/screenshots/`, English, 1440px) |
|---|------|------|
| 1 | Patient: send my case | **Illustrative mock** built in the page from `frontend/src/messages/en.json` (`Send your medical case`); no screenshot exists |
| 2 | Case received, secure status link | `area-1/after/b-status-received-en-1440.png` |
| 3 | Coordinator: My work | `area-2/after/my-work-en-1440.png` |
| 4 | Case workspace: prepare, assign | `area-2/after/case-en-1440.png` |
| 5 | Consultant reviews the case | `area-3/3-1/case-review-en-1440.png` |
| 6 | Preliminary estimate ready | `1c-1/proposal-ready-en-1440.png` |
| 7 | Patient: one-time code step | `area-1/after/a-proposal-code-en-1440.png` (empty field, masked number) |
| 8 | Deposit: bank transfer and reference | `area-1/after/e-payment-bank-en-1440.png` |
| 9 | Admission and voucher | `area-3/3-1/case-treat-en-1440.png` (top panel) |
| 10 | Treatment milestones, change order | `area-3/3-1/case-treat-en-1440.png` (lower panel) |
| 11 | Discharge pack | `area-3/3-1/case-follow-en-1440.png` (upper panel) |
| 12 | Follow-up and outcome questions | `area-3/3-1/case-follow-en-1440.png` (lower panel) |

Screenshots are cropped to the relevant panel and saved as WebP in `assets/` (about 400 KB in total).

## Illustrative slides
Only step 1 is a mock. Steps 6 and 7 are shown from the patient's side while the caption describes the staff action; step 12 shows the coordinator's view, not the patient's questionnaire.

## Privacy
Staff names that were not obvious demo data (coordinator, Consultant and hospital names on steps 5, 6, 8, 9) are blurred. Remaining names are demo data ("Maya Example" etc.). The bank details on step 8 are the dummy values from the UI.

## Not shown yet
- Arabic: screenshots exist for most steps but are not wired in (intake, discharge and follow-up have none). No EN/AR toggle.
- Final quote and the patient-side outcome questionnaire.

Narration: the "Narration" button in the header reads each slide aloud with the browser's built-in speech (off by default, English, voice varies by device). No audio files are included; a recorded voice-over is not done.

Fonts: the page asks for Alexandria and Plus Jakarta Sans and falls back to system fonts offline. Colours follow the Petrol & Paper tokens in `DESIGN.md`.
