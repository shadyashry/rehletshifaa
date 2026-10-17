# Audio mixing report

The mixer is `tools/audio/mix.py`. Measurements come from its own report (`mixes/master_{en,ar}/*.report.json`) and from an independent pass with `tools/audio/inspect_audio.py`, which uses pyloudnorm (ITU-R BS.1770-4) and a 4× oversampled true peak.

## Delivered measurements (48 kHz / 24-bit master WAV, before AAC encode)

| | EN master | AR master | Target |
|---|---|---|---|
| Duration | 123.74 s (film 123.24 s + 0.5 s tail) | 124.92 s (film 124.42 s + 0.5 s tail) | — |
| Integrated loudness | **−16.0 LUFS** | **−16.0 LUFS** | ≈ −16 LUFS |
| True peak | **−1.15 dBTP** | **−1.15 dBTP** | ≤ −1 dBTP |
| Short-term (3 s) maximum | −13.9 LUFS | −14.4 LUFS | no loud moments |
| Short-term minimum while active | −33.4 LUFS | −33.7 LUFS | calm pauses |
| Narration vs music during speech | **17.7 LU** | **17.6 LU** | dialogue-first (≥ 15 LU) |

Stem loudness before the master gain (integrated LUFS):

| Stem | Narration | Music | Ambience | Foley | UI | Transitions | Logo |
|---|---|---|---|---|---|---|---|
| EN | −18.0 | −35.1 | −47.0 | −37.2 | −35.5 | −39.0 | −33.8 |
| AR | −18.0 | −35.1 | −47.0 | −37.2 | −35.5 | −39.1 | −33.7 |

## Chain

1. **Narration (reference).** HPF 75 Hz → −1.5 dB low shelf at 180 Hz → +1.2 dB presence peak at 3.2 kHz → −1.5 dB high shelf at 8.5 kHz → 2.5:1 compression at −24 dB. The narration bus is set to −18 LUFS before mastering, and every other element is set relative to it.
2. **Music (original score).**
   - EQ carved around the voice: HPF 70 Hz, −2.5 dB at 320 Hz, −4 dB at 2.8 kHz, −2 dB high shelf at 7 kHz.
   - A slow 3 s rider holds the bed at a steady short-term level of **−29 LUFS**, so the piano never swells. Gate 3 used −31; for the full film it was lifted 2 dB, because at −31 the speech/music gap was 19.6 LU and the bed was barely perceptible.
   - Ducking: −9 dB under a narration envelope with 250 ms look-ahead, 180 ms attack and 900 ms release, so the bed breathes back between lines.
3. **Ambience.** Each scene's bed is an equal-power crossfaded loop, normalised to its target integrated LUFS (−44 to −50), with a fade in and a fade out. Scene 8 hands from the airport bed to a muffled street bed at the cut into the car.
4. **One-shots.** Peak-normalised to the cue's gain, optionally trimmed to a length with a fade-out, then panned. They are routed to the foley, ui, transitions or logo stems by name.
5. **Master.** HPF 28 Hz → gentle glue compression (1.6:1 at −20 dB, 30/300 ms) → gain to −16 LUFS → a custom look-ahead true-peak limiter (4× oversampled detection, 1.5 ms look-ahead, 90 ms release, no make-up gain) with a −1 dBTP ceiling.
   - pedalboard's Limiter was rejected: it adds make-up gain, and the first test master measured −10.6 LUFS.

## Stems

Seven stems per language are written as 24-bit FLAC to `mixes/master_{en,ar}/stems/`:

- narration
- music
- ambience
- foley
- ui
- transitions
- logo

They share the master's gain, so they sum back to the pre-limiter mix.

## Checks and findings

- **Click scan.** The simple sample-delta detector flags 58 clusters in the narration stem, about 5 per line. Every cluster falls inside a spoken word (fricatives and plosives) and none fall at line edges.
  - The music, ambience, Foley, UI, transitions and logo stems each report **0** candidates.
  - Conclusion: detector false positives on speech, not edit clicks. The detector will be made speech-aware in a later pass.
- **Spectral balance (EN master).**

  | Band | Level |
  |---|---|
  | sub <60 Hz | −27.7 dB |
  | low 60–250 Hz | −5.2 dB |
  | mid 250–2k | −2.3 dB |
  | presence 2–6k | −11.8 dB |
  | air >6k | −13.5 dB |

  The balance is warm and dark, by design, so the narration's presence band stays uncontested.
- **Encoded files.** The final MP4s carry AAC 48 kHz stereo. The encoded loudness is re-measured in `quality_assurance_report.md`, because AAC can add a few tenths of a dB of true peak.

## Reproduce

```bash
node tools/build_film.mjs --lang en --edition master --out master-en.html
node tools/dump_cues.mjs source/master-en.html mixes/cues_master_en.json
python3 -I tools/audio/mix.py mixes/cues_master_en.json mixes/master_en \
  --music assets/audio/music/score_en.wav --name rehletshifaa_master_en --music-target -29
```
