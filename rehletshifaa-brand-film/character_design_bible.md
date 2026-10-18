# Character design bible

All three characters are **fictional**. No real person's likeness, name or medical data was used. They are hand-authored parametric SVG rigs; no image-generation service was available in this environment, which is recorded in `licensing_record.md`.

**Reference sheets** (shot from the live rigs with `tools/shoot.mjs` + `tools/sheet.html`):

- `assets/characters/{amal,nour,consultant}_expressions.png`: neutral, concerned, attentive, thoughtful, reassured, warm, listening, plus blink, look-down and speak.
- `assets/characters/{amal,nour,consultant}_poses.png`: hand and arm poses.

## Style

- **Look.** Refined editorial 2.5D vector illustration: soft gradient modelling, one warm key from front-left, rim-free, matte.
- **Proportions.** Adult, slightly stylised: the head is scaled down from portrait scale (`HEAD_SCALE` 0.82–0.85), with natural shoulder width and a short neck.
- **Faces.**
  - Almond eyes with lids, lashes, an iris and a catch-light.
  - Four-point brows; a nose with a bridge and a soft tip.
  - Full lips with an upper/lower split.
  - Age lines appear only where the character's age warrants them.
- **Honest assessment.** This is a refined vector style, not painterly semi-realism; see the QA report. Its strengths are consistency, deterministic re-render, and a perfect match with the site's flat UI.

## Amal M., the patient (fictional)
| | |
|---|---|
| Age / role | Mid-50s, patient with a knee concern |
| Personality | Dignified, practical, private; worried but not helpless |
| Wardrobe | Dusty-rose hijab (`#b38f87`), oat long knit cardigan (`#d8c9b2`), slate-teal top (`#344b50`); standing: deep taupe wide-leg trousers, dark flats; travels with a petrol-grey carry-on with a coral tag |
| Skin | `#cf9f7c` (lit `#e2b996`, shade `#b2815f`) |
| Face notes | Soft under-eye and nasolabial lines; warm brown eyes |
| Rig | Seated 3/4 (screen-right); standing extension via `RS.standUp` + `RS.walk` |
| Emotional arc | concerned → thoughtful → reassured → warm, at ease |
| Signature acting | Reading with tracking eyes; the exhale and shoulder drop; looks off-screen to think; a small, real smile |

## Nour, the Patient Coordinator (fictional)
| | |
|---|---|
| Age / role | Early 30s, RehletShifaa Patient Coordinator |
| Personality | Organised, warm, attentive; calm competence |
| Wardrobe | Petrol blazer (`#0e4f55`, the brand's staff colour), ivory blouse (`#f4f0e8`), plain ID badge, small gold stud |
| Hair / skin | Espresso hair (`#2a1d18`) in a side part with a low bun; skin `#d6a983` |
| Rig | Seated at a desk (`RS.seatAtDesk`); also appears inside the video tile in scene 10 |
| Signature acting | Typing (seeded finger rhythm); cross-checking paper; the satisfied single nod; a warm smile when speaking to Amal |

## The Consultant (fictional)
| | |
|---|---|
| Age / role | About 50, orthopaedic Consultant |
| Personality | Attentive, unhurried, explains rather than pronounces |
| Wardrobe | White coat (`#f6f5f1`) over a pale-blue shirt (`#c9d9e4`), pen in pocket |
| Hair / face | Salt-and-pepper hair and short gradient beard; thin dark glasses; skin `#c38f6c` |
| Rig | Seated, mirrored to face screen-left (`flip`) |
| Signature acting | A finger tracking the report; eyes leading the head to the imaging; hand to chin; writing; an open-hand explanation |

## Expression system (shared)
The presets live in `RS.EXPRESSIONS` (`source/shared/rs-rig.js`). They are blends of:

- `browRaise`, `browInner`, `browKnit`
- `smile`, `mouthOpen`, `squint`
- `lidL`, `lidR`
- cheek lift (driven by smile)

They layer over gaze (`lookX`, `lookY`), head (`headNod`, `headTilt`, `headTurn`), body (`lean`, `shrug`, `breath`) and the procedural layers (breath, sway, micro-saccades and auto-blink, all seeded per character).

**Rule:** emotions change through intermediate states and always settle. The film never cuts to a new expression.

## Hands
Hands are procedural (`RS.handShapes`), with the parameters curl, spread, index, thumb and thumbFront. The named poses are rest, hold, phone, point, open, loose and type. Props held in a hand are attached in hand space (`RS.attach`), so they never slip.

## Consistency checks used
- **Same rig every scene.** Each scene places the same character definition with only a per-scene seed (it changes breath and blink phase, never design).
- **Shared palettes.** The palettes are the single source in `chars/*.js`.
- **Visual checks.** Every scene was checked in EN and AR with frame contact sheets (`tools/frames.mjs`).
