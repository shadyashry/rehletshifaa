# Storyboard — master (16:9)

The timings are the delivered ones. They are derived per language from the measured narration by `tools/build_timing.py` (EN total 123.24 s, AR total 124.42 s). The Arabic master is a separate production: its own timing, mirrored UI and RTL reading order.

Representative frames:

- `review/frames/master_en_contact.png`
- `review/frames/master_ar_contact.png`

The authoritative implementation is `source/shared/scenes/sNN.js`.

| # | Scene | EN in / dur | AR in / dur |
|---|---|---|---|
| 1 | Uncertainty | 0.00 / 11.00 | 0.00 / 12.52 |
| 2 | Discover | 11.00 / 12.00 | 12.52 / 12.00 |
| 3 | Coordinator | 23.00 / 12.00 | 24.52 / 12.00 |
| 4 | Consultant | 35.00 / 12.50 | 36.52 / 12.50 |
| 5 | Clarity | 47.50 / 12.50 | 49.02 / 12.50 |
| 6 | Decision | 60.00 / 10.50 | 61.52 / 10.50 |
| 7 | Appointments | 70.50 / 12.50 | 72.02 / 12.50 |
| 8 | Arrival | 83.00 / 11.00 | 84.52 / 11.00 |
| 9 | Care | 94.00 / 12.00 | 95.52 / 12.01 |
| 10 | Follow-up + brand | 106.00 / 17.24 | 107.53 / 16.89 |

Times below are scene-local, in seconds. Transitions overlap the previous scene by 0.7–1.0 s.

---

### 1 · Uncertainty: home, daylight
- **Shot.** A slow push-in on Amal on the sofa. Her knee report and phone lie on the coffee table, and a paper veil fades in from black.
- **Acting.**
  1. She reaches, picks up the report (anticipation dip, then lift), and reads; her eyes track the lines.
  2. Concern builds: inner brows rise, head tilt.
  3. An exhale and shoulder drop; then a glance to the phone.
  4. A thought, then she reaches for the phone.
- **Text.** None; the title rail starts in scene 2.
- **Sound.** Home day ambience; paper pickup Foley; the score's first chord, sparse.
- **VO 1.** "When your health needs answers, finding the right care far from home can feel overwhelming."

### 2 · Discover: phone close-up
- **Shot.** A close two-element frame: Amal's face lit by the screen, and the phone in her right hand.
- **Action.**
  1. The thumb taps "Send my case".
  2. The form appears (stepper, upload, file rows tick in, consent, Send).
  3. Confirmation: "Your case is received", the RS-2026-000421 case number and a coral RECEIVED stamp.
  4. The camera pushes into the confirmation card.
- **Title.** "Start With What You Have."
- **Sound.** Phone taps per tap, `ui_confirm`, `ui_submitted`, then the paper transition.
- **VO 2.**

### 3 · Coordinator: Nour's office
- **Match cut.** From the confirmation card to the same case on Nour's monitor.
- **UI.** Documents sort in with check marks, and the status steps through Received → Organized → Ready for Consultant.
- **Pull-back.** The camera reveals Nour typing.
- **Acting.**
  1. She cross-reads the paper report (head turn, finger point).
  2. A satisfied nod: "Coordinator check: nothing missing".
  3. She types a message to Amal (typewriter reveal, then read receipt).
  4. She assigns the case to the Consultant.
- **Title.** "One Dedicated Coordinator."
- **VO 3.**

### 4 · Consultant review: consultation room
- **Match.** Tight on the tablet case view, then a pull-back to the mirrored Consultant.
- **Acting.**
  1. His finger tracks the report lines, with reading saccades.
  2. His eyes lead his head to the imaging; a focus ring appears.
  3. Hand to chin, brows knit, a slow blink.
  4. Findings appear.
  5. He picks up the pen and writes; the recommendation reveals in sync.
  6. Pen down, a reassured look up.
- **Title.** "Consultant-Led Review."
- **Sound.** `pen_write`, `page_turn`, clinic room tone.
- **VO 4.**

### 5 · Clarity: proposal insert, then Amal at home
- **Shot A** (0–4.6). The proposal reveals in reading order: recommendation → next steps (1-2-3) → **preliminary estimate range USD 3,900 – 5,400** with the "Non-binding…" note highlighted → actions. It is tagged "Illustrative example".
- **Shot B.**
  1. Amal, tablet in her lap: concern turns thoughtful.
  2. She asks "Does the estimate include the follow-up review?"; Nour answers.
  3. Her face moves to understanding: a small nod and a gentle smile.
- **Title.** "Clarity Before Commitment." (after the cut).
- **VO 5.**

### 6 · Decision
- **Shot A** (0–4.8). A close single on Amal.
  1. Her eyes leave the screen, then her head follows.
  2. A breath in; an exhale on "The decision is yours"; a slow blink.
  3. A small resolved nod and the beginning of a smile.
- **Shot B.**
  1. Insert on the proposal actions; the thumb hovers (a beat of hesitation), then taps **Continue journey**.
  2. Acknowledgement card: "Next step requested · Nour will contact you to arrange your assessment appointment."
- **Title.** "You Decide." (out before the insert).
- **Score.** Sparsest section.
- **VO 6.**

### 7 · Appointments first, then optional travel
- **Shot.** A wide on Nour at work, easing in to read the plan while keeping her face in frame.
- **UI** (Journey plan):
  1. The **Consultation · Orthopaedics** card goes Requested → **Confirmed** on "appointments first".
  2. Only then does "2 · Optional support — Arranged only at your request" open: Flights, Accommodation, Visa support, Airport transfer.
  3. Only **Accommodation** and **Airport transfer** are ticked, because those are her choices.
  4. Hand-off to the Operations team.
- **Title.** "Your Medical Plan Comes First."
- **VO 7.**

### 8 · Arrival
- **Shot A** (0–4.6). Cairo arrivals hall, with a tracking shot.
  1. Amal walks with her carry-on (hip-pivot walk, bob, counter-swinging arm, cardigan sway).
  2. Her eyes find the driver's tablet sign, "Welcome, Amal" with the logo.
  3. Her brows lift; relief and a smile.
- **Shot B.**
  1. The back seat of the car, with the Nile and palms sliding past (two parallax speeds).
  2. Her phone itinerary: Your driver · Karim → To: Hotel · Zamalek → Appointment tomorrow · 10:00 ✓.
  3. She looks out of the window and exhales.
- **Sound.** Footsteps, suitcase, airport bed → car door on the cut → muffled street bed.
- **Title.** "Coordinated Around Your Care." (out before shot B).
- **VO 8.**

### 9 · Care
- **Shot A.** The Gate 2 two-shot.
  1. The Consultant explains with an open hand and indicates the imaging.
  2. The care plan on the tablet confirms item by item, ending on **"Confirmed after in-person assessment"**.
  3. Amal is reassured and nods.
- **Shot B** (cut-in). Her phone lights; a message arrives from Nour: "I'm here if you need anything during your stay." She gives a warm smile.
- **Title.** "Professional Care. Personal Support."
- **VO 9.**

### 10 · Follow-up and the brand
- **Shot A.** Home in the evening, on the same sofa as scene 1, but at ease.
  1. Notification: "Follow-up review scheduled · Thu 6 Nov · 18:00 · Video call".
  2. It becomes a video tile with Nour; they share a warm exchange.
- **Transition.** The tile opens to fill the frame and becomes the end card.
- **End card** (from about 7.1 s).
  1. The logo reveal lands on the spoken brand name.
  2. Tagline: "Understand Your Treatment Options Before You Travel."
  3. CTA button: **Send my case**.
  4. URL: dev.rehletshifaa.com/en/send-my-case (AR: **أرسل حالتي** with the /ar URL).
  5. Hold to the end.
- No burned captions appear over the end card; the SRT keeps the full narration.
- **VO 10 + 11.**
