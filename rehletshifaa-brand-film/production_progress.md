# Production progress

| Phase | Scope | Status | Evidence |
|---|---|---|---|
| A | Audit of the existing animation; brand extraction from the live site (EN/AR home, how-it-works, send-my-case) | Done | `review/reference/*.png`, tokens in `brand_motion_guidelines.md` |
| B | Creative direction; native EN and AR scripts | Done | `creative_direction.md`, `english_voiceover_script.md`, `arabic_voiceover_script.md` |
| C | Character redesign: rigs, expressions, hands; Gate 2 interaction test | Done (with notes) | `review/gate2/gate2_interaction_test.mp4`, `assets/characters/*` |
| D | Voice casting: 3 EN + 3 AR voices on the same segment, measured; master narration | Done | `voice_casting_report.md`, `assets/audio/voiceover/` |
| E | Scenes 1–10 with acting, object motion, camera, object-led transitions | Done | `source/shared/scenes/`, `storyboard_master.md` |
| F | Sound: original score, synthesised brand sounds, ElevenLabs Foley and ambience, cue authoring, voice-first mix; Gate 3 prototype | Done | `review/gate3/`, `audio_mixing_report.md`, `sound_cue_sheet.md` |
| G | EN and AR masters, independently timed | Done | `renders/rehletshifaa_master_{en,ar}_1080p.mp4` |
| H | QA pass 1 on rendered masters; fixes; QA pass 2 on final renders | Done | `quality_assurance_report.md` |
| I | Shorts: patient 9:16 and business 16:9 in EN and AR | Done | `renders/rehletshifaa_{patient,business}_*.mp4` |
| J | Documentation, licensing record, delivery | Done; push blocked | See below |

## Gates
- **Gate 1 (brand fidelity).** Tokens, fonts and logo are taken from the site and the repository; nothing is invented.
- **Gate 2 (character test).** Passed with notes. The style is a refined vector editorial look, not painterly semi-realism.
- **Gate 3 (motion and Foley prototype).** Passed. Scene 3 rendered with the full mix: −15.9 LUFS and −2.1 dBTP on the encoded AAC.
- **Gate 4 (scene completeness).** All 10 scenes were verified in EN and AR from frame contact sheets.
- **Gate 5 (audio).** Both masters measure −16.0 LUFS and ≤ −1.1 dBTP on the encoded MP4, with 17.6–17.7 LU of speech/music separation.
- **Gate 6 (claims).** Estimate shown only as a non-binding range; final plan after in-person assessment; travel optional and after the decision; no outcome guarantees.
- **Gate 7 (delivery).** Masters, shorts, SRTs, stems (regenerable), documents and the licensing record are all present.

## Open items (owner action)
1. **ElevenLabs licence.** Regenerate the narration and sound effects under a paid plan before public use (`licensing_record.md`).
2. **Native listening checks.** EN and AR narration; AR lines flagged for سـ/صـ articulation.
3. **CTA wording.** The film uses the site label "Send my case"; the brief's "Start My Case" is the alternative.
4. **Git push.** Pushing `feat/review-p0` returned HTTP 403 (GitHub access for this session). The commits are local until access is restored.
