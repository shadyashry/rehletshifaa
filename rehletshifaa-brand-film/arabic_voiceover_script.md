# النص العربي للتعليق الصوتي — «من الحيرة إلى الوضوح»

Arabic Voiceover Script — written as native Arabic copy, not a sentence-by-sentence translation.

Narrator: **Razan** (ElevenLabs voice `EUojVLG1QfxaqqH4ce6s`, Modern Standard Arabic), model `eleven_v4`.
Casting rationale: `voice_casting_report.md`.

Register: فصحى مبسّطة وواضحة — warm, conversational, never a newsreader or government read.
Terminology follows the live Arabic site (`/ar/how-it-works`): منسّق / منسّقك، الاستشاري، التوصية، عرض الرعاية،
التقدير المبدئي (غير ملزم)، أرسل حالتي.

## Localisation decisions

- Second-person verbs are chosen to stay natural without over-gendering the viewer (تحتاج صحتُك، تفهم، تقرّر).
  Where Arabic grammar requires a gender, the conventional generic form is used.
- «منسّق الحالة» is kept as a role name (the site's term) even though the film's Coordinator, Nour, is a woman:
  the role is assigned per case and is not always a woman.
- Brand name is vocalised in the machine script — «رِحْلَة شِفَاء» — so the model never reads «رحلةُ شفاءٍ» as a
  generic phrase. Casting round-trip: Razan's take was transcribed exactly as «رحلة شفاء».
- Sentence lengths are shorter than English; Arabic pauses («…») are written where a native narrator breathes.

## Machine script (one continuous take)

| # | المشهد | التوجيه | النص |
|---|--------|---------|------|
| 1 | حيرة المريضة | `[softly] [warmly]` تفهّم وطمأنينة | حين تحتاج صحتُك إلى إجابات، قد يبدو البحثُ عن الرعاية المناسبة بعيدًا عن بيتك… أمرًا مُرهِقًا. |
| 2 | اكتشاف رحلة شفاء | انفتاح هادئ | مع رِحْلَة شِفَاء، تبدأ بما لديك من معلوماتٍ طبية. خطوةٌ بسيطة… تبدأ بها رحلتك. |
| 3 | منسّق الحالة | اهتمام وتنظيم وثقة | منسّقُ حالةٍ مخصّصٌ لك يرتّب ملفّك، ويرافقك في الخطوات التالية، ويبقى نقطةَ تواصلك الأساسية. |
| 4 | مراجعة الاستشاري | مهنية وهدوء | ويُختار لحالتك استشاريٌّ موثَّق وفق احتياجك الطبي، فيراجع معلوماتك بعناية… ويوصي بالخطوات المناسبة. |
| 5 | الوضوح قبل الالتزام | وضوح | تفهم التوصية، والخطوات التالية، والتكلفة المبدئية… قبل أن تقرّر المتابعة. |
| 6 | قرار المريضة | احترام لقرار المريض | القرارُ قرارُك. وعندما تختار المضيَّ قُدُمًا، نساعدك في ترتيب ما يلي. |
| 7 | المواعيد والسفر | راحة واهتمام | وإن اخترت متابعة رعايتك في مصر، ننسّق مواعيدك الطبية أولًا… ثم ترتيبات السفر العملية التي تحتاجها. |
| 8 | الوصول والتنسيق | دفء | من لحظة وصولك وحتى مواعيدك، يساعدك فريق التنسيق على تنظيم التفاصيل العملية. |
| 9 | الرعاية الطبية | ثبات | يؤكّد فريقُك المعالج خطةَ الرعاية المناسبة، بينما يبقى منسّقك على تواصلٍ معك طوال الرحلة المتفق عليها. |
| 10 | المتابعة | استمرارية واطمئنان | وبعد عودتك إلى بيتك، نساعدك في تنسيق المتابعة المتفق عليها. |
| 11 | الشعار | ثقة ودفء بلا مبالغة | رِحْلَة شِفَاء… افهم خيارات علاجك قبل أن تسافر. |

## On-screen text (Arabic master, RTL)

| المشهد | النص على الشاشة |
|--------|-----------------|
| 2 | ابدأ بما لديك. |
| 3 | منسّقٌ واحد مخصّص لك. |
| 4 | مراجعةٌ يقودها استشاري. |
| 5 | وضوحٌ قبل الالتزام. |
| 6 | أنت تقرّر. |
| 7 | خطتك الطبية أولًا. |
| 8 | تنسيقٌ حول رعايتك. |
| 9 | رعايةٌ مهنية. ودعمٌ شخصي. |
| الختام | رحلة شفاء · RehletShifaa — افهم خيارات علاجك قبل أن تسافر — **أرسل حالتي** — dev.rehletshifaa.com/ar/send-my-case |

All strings above are the live site's Arabic labels where one exists (`home.title`, `nav.send`), otherwise new copy
written for the film. Recommended native-speaker review before public release (see `quality_assurance_report.md`).
