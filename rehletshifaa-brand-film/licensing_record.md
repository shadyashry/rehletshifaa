# Licensing record

| Element | Source | Rights position | Action before public / commercial release |
|---|---|---|---|
| RehletShifaa logo, icon, wordmark, colours | Repository `frontend/public/brand/`, live site dev.rehletshifaa.com | Client's own brand assets | None |
| Fonts: Alexandria, Plus Jakarta Sans, Cairo | Copied from the repository's `frontend` font files | All three are SIL Open Font License 1.1: embedding in video is permitted | None (keep OFL notices with the source) |
| UI depicted (stepper, cards, buttons, copy) | Recreated from the live site; copy from `frontend/src/messages/{en,ar}.json` plus film-specific strings | Client's own product | None |
| Characters (Amal, Nour, Consultant) | Hand-authored parametric SVG rigs in this project | Original work for the client. No real person's likeness was used, and no image-generation service was available or used | None |
| Environments, props, motion | Hand-authored SVG/JS in this project | Original work | None |
| Score (`score_*.wav`) | Synthesised by `tools/audio/score.py` (no samples, no third-party music) | Original work | None |
| UI, transition and logo sounds; office/clinic room tones | Synthesised by `tools/audio/brand_sfx.py` | Original work | None |
| Foley and ambience: paper_pickup, page_turn, papers_slide, phone_taps, keyboard_soft, chair_settle, phone_set_down, pen_write, footsteps, suitcase, car_door, amb_home_day, amb_home_evening, amb_airport, amb_street | ElevenLabs Sound Effects `eleven_text_to_sound_v2`, generated for this film (flow `0YXLXVsrMuY7r5AM082b`) | Governed by the ElevenLabs plan of the generating workspace. **See the risk below** | Confirm the plan; regenerate under a paid plan if needed |
| Narration, EN and AR | ElevenLabs `eleven_v4` TTS. EN voice "Cherine Hani" (`eiNgkRczHJmif3gxSoyz`); AR voice "Razan" (`EUojVLG1QfxaqqH4ce6s`), both library voices. Flows: auditions `BRDKIHkB6qcC3e3zFtZA`, masters `0YXLXVsrMuY7r5AM082b` | Governed by the ElevenLabs plan. No voice cloning of any real person | **Required:** confirm the plan; regenerate under a paid plan if needed |
| Case number, dates, estimate range | Invented and labelled "Illustrative example" on screen | No real patient data | None |

## Risk: ElevenLabs plan tier

**Evidence.** During production the workspace returned *"Free Tier access has been disabled"* under parallel load, which strongly suggests a free-tier workspace. ElevenLabs' free tier does not include a commercial licence, and it requires attribution.

**Required action before any public or commercial use.** Generate (or re-generate) the narration and the ElevenLabs sound effects from a workspace on a paid plan with commercial rights:

1. Re-run the flows on the paid workspace.
2. Replace `assets/audio/voiceover/{en,ar}/raw/*.mp3` and `assets/audio/{foley,ambience}/src/*.mp3`.
3. Rebuild with the commands in `README.md`.

The timing re-derives from the new narration automatically.

Until that is done, the films are suitable for internal review only.

## Usage record
- About 9–10k ElevenLabs credits were used for auditions, masters and sound effects. All calls ran serially; no variation was generated without being used, except the auditions.
