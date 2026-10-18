# Brand motion guidelines

All values below come from the live site, dev.rehletshifaa.com, in its "Petrol & Paper" theme, and from the repository's `frontend/public/brand/` assets. The film invents no new brand colours.

## Colour tokens (`RS.T` in `source/shared/rs-scene.js`)

| Token | Hex | Use in film |
|---|---|---|
| paper | `#f7f4ee` | Default background, captions plate, end card |
| paperDeep | `#efeae0` | Secondary surfaces, icon wells |
| white | `#ffffff` | Cards |
| line / lineStrong | `#e3ded4` / `#cfc8ba` | Card borders, dividers, placeholder text lines |
| heading | `#13292e` | Titles, headings, caption text |
| ink | `#33474c` | Body text |
| muted | `#5d6e72` | Labels, secondary text |
| petrol600 | `#0e5f66` | Primary buttons, confirmed pills, checks, rail |
| petrol700 | `#0e4f55` | Emphasis numerals (estimate range), signage |
| petrol500 / 400 | `#1d6b6b` / `#5fb3ac` | Imaging focus ring, accents, read receipts |
| petrol100 / 50 | `#d9e8e6` / `#eef4f3` | Soft fills (recommendation box, notes, halo) |
| coral | `#e07a5f` | Title rule, active rail node, stamp, luggage tag — sparingly |
| logo ink / accent / dot | `#29454d` / `#247c86` / `#e98d78` | Logo lockup only |

Coral is an accent, never a fill for large areas. Petrol carries every "done / confirmed" state.

## Typography
| Role | EN | AR |
|---|---|---|
| Titles and wordmark | Alexandria 600 | Alexandria (Arabic subset) 600 |
| Body, UI and captions | Plus Jakarta Sans 400–700 | Cairo 400–700 |

- The fonts are embedded from the repo, `frontend` → `source/assets/fonts`.
- Captions are HTML, so Arabic shapes natively: 36 px EN, 38 px AR, on a paper plate at 90% opacity.

## Logo
- The lockup is the icon (`assets/brand/rehletshifaa-icon.png`), plus the wordmark **Rehlet**Sh**ı**faa, plus the coral dot over the dotless ı, plus the Arabic line رحلة **شفاء**. It is built by `RS.ui.logo`, which measures the dot position from the font at build time.
- The lockup is **always LTR**, in both films; it is a mark, not running text. In RTL layouts it is end-aligned using its measured width.
- **Reveal (end card):**
  1. The icon scales from 0.82 to 1 with a soft back-out over 0.7 s.
  2. The wordmark wipes left to right over 0.8 s.
  3. The dot pops at the end, with a 0.45 s back-out.
  4. The reveal lands on the spoken brand name, and the logo signature sound plays at the same moment.

## Motion language
- **Calm by default.** Eases are `sine.inOut`, `power2.out` and the rig's `settle` (anticipation → action → overshoot → settle). There are no bounces on content, except one small back-out on confirmations (checks, pills) as a reward.
- **Reading order.** UI elements reveal in reading order: left to right in EN and right to left in AR. Their x-offsets mirror per language (`rtl ? -x : x`).
- **Titles.**
  - Position: top-start, with an eyebrow, a coral rule and the journey rail of 8 nodes. The active node is highlighted per scene.
  - Timing: in on the first spoken phrase, out before the cut or before any on-screen UI would collide (`RS.TITLE_AT`, `RS.TITLE_OUT`).
- **Transitions come from objects.** For example, the phone confirmation card pushes into the office monitor, a tablet matches into the consultant's tablet, and the video-call tile opens into the end card. Scene-to-scene dissolves are short paper fades of 0.7–1.0 s.
- **Camera.** A single 2D camera with parallax layers (far 0.45–0.6, mid 0.7–0.8, near 1). Moves are slow push-ins or motivated pull-backs; there are no whip pans. Every camera key is a pure function of time, so the film is seek-safe and renders deterministically.

## Layout
- 1920×1080 masters with a safe margin of 48 px. Captions sit 64 px from the bottom, at most 1240 px wide.
- **RTL**
  - The Arabic master mirrors UI layout and reading-order motion.
  - It keeps the characters' screen positions, because blocking is physical.
  - It keeps physical hands as they are. For example, the right hand holding the phone in scene 2 stays a right hand.
- Speech-adjacent UI, such as chat bubbles and notifications, sits on the screen side away from the character's face, in both languages.

## Do / don't
- **Do** use real site components and copy: "Send my case", the stepper, "Illustrative example" tags.
- **Don't** show a price without "Non-binding" and the range. Don't show a care plan without "Confirmed after in-person assessment". Don't tick travel services the patient did not ask for.
