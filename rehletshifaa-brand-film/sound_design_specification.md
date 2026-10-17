# Sound design specification

**Principle:** the narration leads. Everything else (score, rooms, objects, interface) is there to make the story felt, never to compete with the voice. The film never gets loud.

## 1. Layers and their jobs

| Layer | Job | Level rule (pre-master) |
|---|---|---|
| Narration | Carries the story; the reference for every other level | Set to −18 LUFS integrated, then mastered with the mix |
| Music | Emotional arc, calm and low | Held at −29 LUFS short-term; ducked −9 dB under speech; ≥ 15 LU below narration during speech (delivered: 17.7 / 17.6 LU) |
| Ambience | Where are we? (home day, office, clinic, airport, street, home evening) | −44 to −50 LUFS beds; heard, not noticed |
| Foley | Physical truth of the acting (paper, pen, keyboard, taps, chair, footsteps, case, car door) | Peaks −22 to −33 dBFS; panned to where the action is |
| UI | Digital progress (confirm, submitted, message, calendar) | Soft, rounded tones; peaks −20 to −33 dBFS |
| Transitions | Object-motivated moves between shots (paper, air) | Peaks −27 to −30 dBFS |
| Logo | One signature at the brand reveal | Peak −20 dBFS, landed on the spoken brand name |

## 2. Score

- **Source.** The score is original: it is synthesised in `tools/audio/score.py` with no samples or third-party music. It uses three voices:
  - a felt-piano additive model (stretched partials, per-partial decay, soft hammer);
  - warm detuned pads;
  - a low air layer.
- **Key, tempo and motif.** D major, 60–72 BPM. The *journey motif* is F♯4–A4–E4–D4 (scale degrees 3-5-2-1); it appears in scenes 2, 5, 7 and 10 and resolves on the logo.
- **Picture lock per language.** Every scene starts on a downbeat of its own language's timing, so chord changes land on cuts in both EN and AR. There are two renders: `score_en.wav` and `score_ar.wav`.
- **Arc.**

| Scene | Harmony | Density | Intent |
|---|---|---|---|
| 1 Uncertainty | Bm9 → Gmaj7 → D/F♯ | sparse | Weight without drama |
| 2 Discover | Gmaj7 → D/F♯ → Em9, motif | light | First possibility |
| 3 Coordinator | G6 → D/F♯ → Em9 | moderate | Someone has it in hand |
| 4 Consultant | Bm7 → Gmaj7 → Asus | moderate | Focus, care |
| 5 Clarity | Gmaj7 → A → F♯m7, motif | moderate | Understanding |
| 6 Decision | Bm9 → Asus | **space** | The choice is hers: the music steps back |
| 7 Appointments | Dadd9 → A/C♯ → Bm7, motif | moderate | Order, sequence |
| 8 Arrival | Gmaj7 → Dadd9 → Asus | moderate | Arrival, relief |
| 9 Care | Em9 → G6 → Dadd9 | full (still soft) | Warmth |
| 10 Follow-up + logo | Gmaj7 → Asus → Dadd9 (held), motif | resolving | Home, resolution |

## 3. Ambience

The beds are 15 s ElevenLabs sound-effect loops:

- `amb_home_day`
- `amb_airport`
- `amb_street`
- `amb_home_evening`

The two room tones, `roomtone_office` and `roomtone_clinic`, are synthesised in `tools/audio/brand_sfx.py`. The mixer crossfades every loop equal-power, so there are no audible seams.

## 4. Foley and interface

Every effect is authored *in the scene module, next to the action that causes it*, via `ctx.sfx(time, name, gainDb, {pan, dur})`. When a language re-times a scene, picture and sound therefore move together. The full list with times is in `sound_cue_sheet.md`.

| Group | Sounds | Source |
|---|---|---|
| Paper and desk | `paper_pickup`, `page_turn`, `papers_slide`, `pen_write`, `phone_set_down`, `chair_settle`, `keyboard_soft` | ElevenLabs SFX v2, generated for this film |
| Touch | `phone_taps` (trimmed per tap) | ElevenLabs SFX v2 |
| Travel | `footsteps`, `suitcase`, `car_door` | ElevenLabs SFX v2 |
| UI | `ui_confirm`, `ui_submitted`, `ui_message`, `ui_calendar` | Original synthesis: rounded sine/triangle partials and soft attacks, pitched within the score's key |
| Transitions | `transition_paper`, `transition_air` | Original synthesis (filtered noise swells) |
| Logo | `logo_signature` | Original synthesis: the journey motif voiced as a soft bell-piano |

## 5. Rules that were applied

- No effect plays without a visible cause (no "decorative" whooshes).
- Typing sounds play only while hands are visibly typing.
- Interface sounds stay under narration and never land on a stressed syllable.
- Scene 6 keeps the music sparsest: the decision belongs to Amal.
- The logo signature lands on the spoken brand name, and the score resolves under it.
- The end card holds in calm; there is no final hit.

## 6. Deliverable audio

- **Final mix.** In each MP4: AAC 48 kHz stereo, −16 LUFS integrated, ≤ −1 dBTP.
- **Stems.** 24-bit FLAC: narration, music, ambience, foley, ui, transitions, logo. Location: `mixes/master_{en,ar}/stems/`.
- **Narration.** Per-line WAVs in `assets/audio/voiceover/{en,ar}/` and the raw takes in `raw/`.
- **Measurements.** In `audio_mixing_report.md`.
