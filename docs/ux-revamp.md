# Portal UX revamp

## Scope and decisions

Improve the existing portal incrementally: shared account/navigation controls, ownership queues,
review before claiming, meaningful sections, role-focused actions, and EN/AR accessibility.
Preserve the commercial workflow and all financial/clinical gates.

Pre-ownership review is a dedicated read-only intake preview for an unassigned RECEIVED case.
It exposes routing information and the submitted medical summary needed for triage, but no
patient contact details, internal messages, prices, legal identity evidence or document downloads.
General workspace/document access continues to require ownership/assignment or scoped lead access.

Team visibility means the lead's direct and indirect coordinator reports, excluding the lead's
own cases. Existing staff receive no invented reporting relationships. System administrators
manage explicit reporting relationships; cycle prevention is required.

## Initial audit

| Experience | Observed friction | Planned correction |
| --- | --- | --- |
| All portal roles | Large identity card below a marketing-sized title | Compact header avatar and account settings |
| Coordinator queue | Mixed ownership; claim button before review; no search | Ownership tabs, search, status filter, review entry |
| Coordinator case | General access unavailable before claiming | Dedicated limited intake preview, ownership action last |
| Team lead | Global case access rather than reporting scope | Persistent hierarchy, scoped reads and transfers |
| All case workspaces | Empty documents, reviews, proposal, task panels | Conditional panels; retain required input and blockers |
| Doctor | Assignment acceptance and workflow actions precede evidence | Review content first, assignment/clinical decision afterward |
| Operations / finance | Generic queue; policy configuration ahead of work | Searchable assigned work; contextual actions; settings secondary |
| Patient / representative | Staff-oriented workspace density | Patient language, concise journey and required actions |
| Administration / credentialing | Several unrelated forms on one page | Focused sections, directory selectors, read-only audit view |
| Identity review | API role missing from portal navigation | Dedicated review access with existing authorization |
| Connected secure journeys | Verify loading, errors, labels, RTL, decision order | Targeted improvements without changing verification gates |

## Implemented coverage

| Experience | Delivered behavior | Verification coverage |
| --- | --- | --- |
| Shared portal header | Compact initials avatar, account menu, persisted display name and locale, Keycloak account link, sign-out, focus return, Escape handling, and current-route language switching | EN/AR browser matrix for every portal role; account persistence journey |
| Coordinator | Needs ownership, My cases, and Team cases tabs; search/status filters; pagination; remembered queue state; review-first intake preview; final ownership action; conflict recovery | Browser journeys plus backend authorization tests |
| Coordinator lead | Direct and indirect report scope for queue, workspace, directory, and transfer actions; no global coordinator access | Backend hierarchy tests and EN/AR browser coverage |
| Doctor | Evidence and available review content precede assignment and clinical decisions; unrelated workflow controls are suppressed | EN/AR desktop browser coverage |
| Operations and finance | Assigned work is searchable; current-stage actions stay contextual; settings remain secondary | EN/AR desktop browser coverage and existing backend workflow suite |
| Patient and representative | Compact journey workspace, meaningful sections, patient proposal decisions, onboarding, and backend-computed readiness remain in place | EN/AR desktop/mobile browser coverage and existing secure-journey tests |
| System administration and credentialing | Searchable practitioner selection replaces manual UUID entry; explicit reporting management is system-admin-only; auditor mode is read-only | EN/AR browser coverage and reporting authorization tests |
| Identity reviewer | Dedicated review queue and decision form using the existing identity-review API | EN/AR mobile browser coverage |
| Auditor | Consistent portal shell with read-only directories and reporting hierarchy | EN/AR browser coverage |

Empty optional documents, reviews, proposal, tasks, timeline, travel facts, and profile facts are
omitted. Loading failures and restricted access remain distinct from an empty result. Required
actions, blockers, approvals, and incomplete onboarding steps remain visible.

## Interaction counts

Counts below are deterministic UI actions from the stated start to end; text entry and reading are
not counted. The baseline is the checked-in portal before this change, inspected in source.

| Task | Start → end | Before | After |
| --- | --- | ---: | ---: |
| Take an unowned case | Coordinator queue → owned workspace | 1, but ownership happened before review | 2: Review case, Take ownership after review |
| Open an owned case | Visible queue row → workspace | 1 | 1 |
| Return to a filtered queue | Workspace → same tab/search/filter/page | 1, state was not preserved | 1, state and scroll position are restored |
| Change language in a case | Open case → same case in other locale | No shared account control | 2: avatar, language option |
| Update display name | Portal → refreshed header name | No persisted portal setting | 3: avatar, account settings, save |

The ownership path intentionally adds a review action because claiming a case is consequential and
the required minimum intake evidence must be visible first.

## Verification evidence

- `mvn -o -q "-Dmaven.repo.local=C:\\Users\\hp\\.m2\\repository" test`: 84 tests,
  0 failures, 0 errors, including all 21 Flyway migrations on H2.
- `pnpm typecheck`: passed.
- `playwright test e2e/portal-ux.spec.ts --project=chromium`: 25 tests passed. The matrix covers
  coordinator lead, doctor, operations, finance, patient, representative, credentialing admin,
  auditor, and identity reviewer in English and Arabic; Arabic uses a 390 px viewport. It also
  covers review-before-claim, simultaneous claim failure, queue restoration, keyboard tabs,
  account persistence, error-versus-empty document handling, and draft preservation on failed send.
- Synthetic test data was used for browser QA; no patient records were accessed. After-state images
  are written to `output/ux/` for every role/locale combination. Representative coordinator and
  Arabic identity-review images were visually inspected for layout, direction, overflow, hierarchy,
  and action placement.
- Before-state screenshots were unavailable because this work resumed from an uncommitted partial
  implementation. The before observations and interaction counts come from the checked-in source;
  no before image was fabricated.

## Remaining limitations

- This is not a claim of WCAG 2.2 AA certification or moderated usability testing. Automated checks
  covered semantics, keyboard tab behavior, direction, responsive overflow, and core focus flows;
  a full assistive-technology audit remains future work.
- The secure public case-access, proposal, activation, and onboarding journeys were protected by the
  existing backend regression suite, but were not all recaptured visually in this increment.
- The local Next.js development server reports its known CSP `eval()` diagnostic because the app's
  production policy blocks development-only stack reconstruction. Production rendering does not use
  that development path.
