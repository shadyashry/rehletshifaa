# Public doctor directory — 4 October 2026

Nine supplied CVs add nine bilingual public profiles to the existing three-doctor directory.
The public profile catalogue does not create practitioner accounts, credential approvals,
availability, clinical privileges, or case assignments.

| Supplied file | Profile | Care area |
| --- | --- | --- |
| Ahmed_Saleh_CV.docx | Ahmed Magdy Mahmoud | Plastic & Reconstructive Surgery |
| Amr Abdelazeem CV.docx | Amr Abdelazeem | Digestive & Liver Care |
| Curriculum Vitae (ahmed khaled)-2.docx | Ahmed Khaled | Orthopedics — joint replacement |
| CV2026.pdf | Mostafa Farid | Interventional Neuroradiology |
| Dr_Mustafa_Mohammed_Abbas_CV_Professional_Summary_Updated.docx | Mustafa Mohammed Abbas | Women's Health |
| Mohamed_Hamdy_Zaid_Professional_CV.pdf | Mohamed Hamdy Zaid | General & Metabolic Surgery |
| Mohammed Ali CV 2024.pdf | Mohammed Ali Ibrahim Hussien | Orthopedics — spine |
| Mostafa_Baraka_CV_Updated_Sep_2026_EPOS.docx | Mostafa Baraka | Orthopedics — pediatric and limb reconstruction |
| MY CV.docx | Mahmoud Mohamed Ghaleb | Women's Health |

`austria hungary.pptx` is a history presentation and contains no doctor profile.
The name inside `Ahmed_Saleh_CV.docx` takes precedence over its filename.

The five new categories have public pages, navigation, sitemap entries and intake options.
V66 adds the same five reference categories to the database; applied migrations are untouched.
The original home-page care-area features remain, with links to the five additional areas.

The directory has search, category filters, result announcements, empty-state recovery and
responsive English/Arabic layouts. Individual pages show clinical focus, qualifications,
appointments, professional standing and three selected career contributions.
Featured credentials highlight professorial leadership, EPOS research presentations and
the European Diploma in Neuroradiology; they are an editorial selection, not a ranking.

Public summaries omit home addresses, birth dates, family information, phone numbers,
private emails, referees' details and unverified success/volume claims. RCOG Part 1 is
identified as an examination stage, not membership. The 2024 spine CV remains dated.
New profiles explicitly attribute qualifications and appointments to the supplied CVs;
they do not claim independent credential verification or current booking availability.

Accessibility follows WCAG 2.2 guidance for labeled controls, keyboard operation, visible
focus, status messages and reflow. This is not a formal accessibility conformance audit.

## Verification and release status

- Frontend `pnpm typecheck`: PASS after regenerating the route types.
- Nine focused Playwright checks: PASS across the final runs. These cover directory and
  care-area reflow, English/Arabic mobile presentation, search, category filtering, empty
  results, keyboard focus, care-area navigation, all nine bilingual profiles and individual
  achievement-page reflow. Desktop and Arabic mobile profile captures were visually reviewed.
- `ExpandedCareAreaMigrationTest`: PASS. H2 applied all 66 migrations from empty and
  confirmed the eight categories and Arabic labels.
- Broader offline backend suite: 460 tests, 7 failures, 37 errors, 1 skipped. Reported
  failures include MFA/reauthentication in platform access and journey workflows; those
  paths were not changed by this update. The complete backend gate is not green.
- The original Docker rebuild attempts hit registry DNS failures. On the homepage-media
  follow-up, both production images built successfully with the tunnel overlay. The frontend
  builder now invokes the installed Next.js executable directly, avoiding a redundant
  Corepack/pnpm download that failed on `registry.npmjs.org` DNS.
- Deployment completed with the canonical Compose files and named tunnel. The user approved
  stopping `requirement-ai-web-1` to release port 8080; that container remains stopped.
  The database already held governance migrations V64 and V65. Their original committed
  SQL files were restored from commit `19a970c`, and the category migration was moved to V66.
  Flyway validated all 66 migrations and applied V66 successfully; all eight categories are
  present. No volumes were deleted or database history repaired. The reference cache was refreshed.
- Stable-domain backend health reports UP and the consultant page returns HTTP 200.
- Five focused stable-domain Playwright checks passed: directory filtering, care-area
  navigation, all nine bilingual profiles, and English/Arabic homepage image and video playback.
- The local frontend preview runs on port 3100. Permanent domain configuration is unchanged.

The changes are visible at https://dev.rehletshifaa.com/en/consultants and
https://dev.rehletshifaa.com/en/care-areas, with equivalent Arabic pages.

## Homepage media follow-up

The user requested restoring the homepage's main picture and videos. The hero photograph
now uses its direct static JPEG path, and the journey videos are visible inline with native
playback controls and their existing poster images. English and Arabic select their original
localized MP4s; playback remains user initiated.

Frontend type checking and the production build pass. Both localized videos played in
installed Chrome, with loaded video dimensions and advancing playback time. This machine's
test Chromium lacks MP4 decoders (`DEMUXER_ERROR_NO_SUPPORTED_STREAMS`), so the media
regression test accepts `PLAYWRIGHT_MEDIA_CHANNEL=chrome` for that environment.

## Additional vascular CV — 4 October 2026

`Curriculum Vitæ (Dec. 2025) - Adobe cloud storage.pdf` identifies Hamdy AbdelAzeem
AboElNeel AbdelHameed, who was absent from the existing directory. Added one bilingual
profile at `consultants/hamdy-abdelazeem` and a Vascular & Endovascular Surgery area at
`vascular-endovascular-surgery`. The catalogue now has 13 doctors and nine care areas.
The new area is included in navigation, sitemap and intake through the existing shared catalogue.

The profile highlights the CV-reported associate professorship, dated department leadership
and venous research. Current appointments remain explicitly attributed to the December 2025
CV. Private contact information, address, birth date, religion and family details are omitted.
No practitioner account or clinical privileges are created. V67 adds the reference category.

Frontend type checking and the focused H2 migration test passed (67 migrations from empty).
The canonical tunnel stack was rebuilt successfully, V67 applied and backend health reports UP.
Three focused live checks passed across the final runs: care-area navigation, directory filtering,
and the unique vascular profile with English/Arabic credentials and category links. The first
vascular check incorrectly expected the intake category selector on step one; that assertion
was removed because the selector belongs to step two. Intake uses the shared care-area catalogue.
