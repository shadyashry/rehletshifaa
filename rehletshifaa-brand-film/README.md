# RehletShifaa: "From Uncertainty to Clarity" (brand film)

The film follows one fictional patient, Amal, from a worrying knee report to a confirmed plan of care. It is two independent productions, English and Arabic, each with its own narration, timing, RTL layout and subtitles, plus two purpose-built short editions per language.

> **Status: internal review.** Before public or commercial use, confirm the ElevenLabs licence and complete the native-speaker listening checks. See `licensing_record.md` and `quality_assurance_report.md`.

## Deliverables

| File | Format | Length |
|---|---|---|
| `renders/rehletshifaa_master_en_1080p.mp4` | 1920×1080 H.264 High, 30 fps, AAC 48 kHz stereo, −16 LUFS / ≤ −1 dBTP | 2:03.2 |
| `renders/rehletshifaa_master_ar_1080p.mp4` | same | 2:04.4 |
| `renders/rehletshifaa_patient_{en,ar}_9x16.mp4` | 1080×1920, same codecs | 38.3 s / 39.3 s |
| `renders/rehletshifaa_business_{en,ar}_16x9.mp4` | 1920×1080, same codecs | 40.2 s / 41.8 s |
| `subtitles/rehletshifaa_master_{en,ar}.srt` | UTF-8 SRT (AR with RTL mark) | — |
| Stems | 7 × 24-bit FLAC per film: narration, music, ambience, foley, ui, transitions, logo | regenerated (below) |

## Documents

| Document | Contents |
|---|---|
| `creative_direction.md` | Story, tone, claims guardrails, CTA |
| `brand_motion_guidelines.md` | Tokens, type, logo, motion language, RTL rules |
| `character_design_bible.md` | Characters and the expression system; sheets in `assets/characters/` |
| `storyboard_master.md` | Scene-by-scene, with delivered EN/AR timings |
| `motion_design_specification.md` | Rig, acting grammar, camera, determinism |
| `sound_design_specification.md` | Layers, score, Foley, rules |
| `sound_cue_sheet.md` | Generated from the authored cues |
| `audio_mixing_report.md` | Chain and measurements |
| `english_voiceover_script.md` | English narration |
| `arabic_voiceover_script.md` | Native Arabic script (فصحى مبسطة) |
| `voice_casting_report.md` | Auditions, scores, decisions |
| `quality_assurance_report.md` | Two QA passes, open items |
| `licensing_record.md` | Every asset's source and rights |
| `production_progress.md` | Phase log |

## Layout

```
rehletshifaa-brand-film/
├─ source/                     HyperFrames project (renders from here)
│  ├─ shared/
│  │  ├─ rs-rig.js, rs-face.js, chars/   character rigs
│  │  ├─ rs-scene.js, rs-env*.js, rs-props.js, rs-ui.js, rs-proposal.js, rs-standing.js
│  │  ├─ rs-film.js            film assembly, overlay (titles, rail, captions), cue authoring
│  │  ├─ rs-editions.js        edition planner (segment scrubbing) + vertical layout
│  │  ├─ rs-i18n.js            EN / AR strings
│  │  └─ scenes/s01…s10.js     one module per scene
│  ├─ data/timing.{en,ar}.*    per-language timing derived from the narration
│  ├─ assets/                  fonts, brand icon, mixed audio for the renders
│  └─ {master,patient-9x16,business-16x9}-{en,ar}.html   generated roots
├─ tools/                      build, timing, frames, audio (score, sfx, mix, cue sheet, inspect)
├─ assets/audio/               voiceover (raw takes + lines), foley/ambience sources, score, brand sfx
├─ mixes/                      cue dumps, mixes, stems, reports
├─ renders/                    final MP4s
├─ subtitles/                  SRT
└─ review/                     gate tests, reference captures, QA frames
```

## Rebuild and render

Requirements: Node 22, Python 3.11+ with `numpy`, `scipy`, `soundfile`, `pyloudnorm`, `pedalboard` and `faster-whisper`, plus ffmpeg. Then `npm install` in this folder and in `source/`, and `npx hyperframes browser ensure`.

```bash
# 1. narration → per-line files + word timings (only after new takes)
python3 -I tools/split_narration.py en assets/audio/voiceover/en/raw/en_master_take1.mp3 assets/audio/voiceover/en   # and ar
# 2. per-language timing, captions and SRT
python3 -I tools/build_timing.py
# 3. original score and synthesised brand sounds (deterministic, seeded)
python3 -I tools/audio/score.py source/data/timing.en.json assets/audio/music/score_en.wav
python3 -I tools/audio/brand_sfx.py assets/audio/brand
# 4. a film: build → dump cues → mix → attach → render
node tools/build_film.mjs --lang en --edition master --out master-en.html
node tools/dump_cues.mjs source/master-en.html mixes/cues_master_en.json
python3 -I tools/audio/mix.py mixes/cues_master_en.json mixes/master_en \
  --music assets/audio/music/score_en.wav --name rehletshifaa_master_en --music-target -29
cp mixes/master_en/rehletshifaa_master_en.wav source/assets/mix/master_en.wav
node tools/build_film.mjs --lang en --edition master --audio assets/mix/master_en.wav --out master-en.html
(cd source && npx hyperframes render . -c master-en.html -o ../renders/rehletshifaa_master_en_1080p.mp4 --quality standard)
```

**Editions** (`patient-9x16`, `business-16x9`) follow the same steps. The only difference is that the score is composed to the edition's own cut:

```bash
node tools/edition_timing.mjs patient-9x16 en mixes/patient-9x16_en.timing.json
python3 -I tools/audio/score.py mixes/patient-9x16_en.timing.json assets/audio/music/score_patient-9x16_en.wav
```

**Checking picture without rendering:**

```bash
node tools/build_film.mjs --lang ar --only s06-decision --out test-s06-ar.html
node tools/frames.mjs source/test-s06-ar.html test-ar /tmp/s06 1.5,4.0,7.0 0.5
```

## What is versioned

Git holds code, documents, subtitles, cue and report JSON, the small audio sources (narration takes, Foley and ambience MP3s) and the final MP4s.

Regenerable intermediates are rebuilt by the commands above and kept out of the product repository:

- the score WAVs
- the synthesised brand-sound WAVs
- the per-line narration WAVs
- the mixes and FLAC stems

## Key decisions
- **One codebase, two films.** Arabic is a native production: its own script, its own narration and its own timing, with mirrored UI and RTL reading order. Characters keep their physical blocking.
- **Determinism.** Every pose, camera and walk is a pure function of time, and every random value is seeded, so any frame re-renders identically.
- **Editions reuse scenes.** They scrub time-windows of the master's scene modules (`sub.tweenFromTo`), so choreography is never duplicated, and sound cues are remapped automatically.
- **CTA label.** The CTA is "Send my case" / "أرسل حالتي", the live site's label. The brief's "Start My Case" is recorded as an alternative.
