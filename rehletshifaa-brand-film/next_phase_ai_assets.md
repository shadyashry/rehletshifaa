# Next phase: professional characters, objects and sound (AI-assets route)

**Decision (owner, 2026-10-17).** Replace the hand-drawn vector characters, props and environments, and the synthesised score, with generated professional assets. Keep everything that must be exact as code.

## Why
The owner's review found the characters, objects and sound effects not professional. Two causes:

- **Visuals.** Characters drawn in code (parametric SVG) have reached their quality ceiling. More iteration on the rig will not make them cinematic.
- **Sound.** The score is a numpy-synthesised piano, which sounds synthetic. The effects are single generic one-shots, not layered or placed in a room.

## Architecture (hybrid)
```
generated stills ──► image-to-video clips ──┐
(characters, rooms, props;                  ├──► HyperFrames scene (video layer)
 consistent references)                     │        + code layers kept exact:
                                            │          website UI on screens, logo,
ElevenLabs music (score, stems) ─┐          │          titles, captions, RTL text,
ElevenLabs SFX (layered) ────────┼──► mix.py (unchanged) ──► render ──► QA
narration (existing / re-gen) ───┘
```

**Kept as code** (it must stay exact and bilingual):

- the website UI on phone, tablet and monitor screens;
- logo lockup, titles, journey rail, captions;
- the end card and CTA;
- timing per language (`build_timing.py`), the edition system, the mixer and the QA tooling.

**Generated:** characters, environments, props, acting shots, score, Foley and ambience.

**Never let the generator draw text or UI.** Screens are generated blank or green and the code UI is composited on top. This keeps the claims, such as the non-binding estimate note, exact in both languages.

## Steps and gates
1. **Gate A: character sheets.** Amal, Nour and the Consultant, from the existing bible (`character_design_bible.md`: age, wardrobe, palette). Each gets front, 3/4 and profile views, plus 5 expressions. These reference images are locked for consistency. **The owner approves before anything else.**
2. **Environment plates.** Home by day and evening, coordinator office, consultation room, Cairo arrivals hall, car interior. One style, with the Petrol & Paper palette as an accent.
3. **Gate B: one scene end to end.** Scene 5 ("Clarity before commitment"): generated shots, composited UI, new score cue and layered SFX. The owner approves the look and sound.
4. **Roll out** to scenes 1–10, then the editions (patient 9:16 needs vertical-native shots).
5. **Score.** ElevenLabs music: a soft, low ambient piano, about 125 s per language, with stems. It is cut to each language's scene starts.
6. **Sound effects.**
   - Regenerate with layered prompts: a close and a room layer per action.
   - Add per-scene room reverb and EQ in `mix.py` (a new `room` field on cues).
7. **Mix, render, QA.** Two passes, as before. The claims audit must be repeated.

## Risks
| Risk | Mitigation |
|---|---|
| Character drift between shots | Locked reference images per character; fewer extreme close-ups of hands; reject and re-generate drifted clips |
| Generated text or UI artefacts | Blank or green screens only; all text from code |
| Cost (credits) | Gate B before roll-out; about 25–35 clips in total, 4–8 s each |
| Licence | Generate on a paid ElevenLabs plan with commercial rights (also fixes the narration item in `licensing_record.md`) |
| Arabic/RTL | Unchanged: text stays in code, characters keep physical blocking |

## Requirement to start
Connect the **full** ElevenLabs connector (image, video and music generation) at https://claude.ai/customize/connectors, using the custom connector URL `https://api.elevenlabs.io/v1/mcp`. Then start a **new** session on this repository and branch (`feat/review-p0`).
