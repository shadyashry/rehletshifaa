# Shape plan — Staff work views: CurrentAction, MyWork, CaseQueue

Status: **draft for GATE 2** (not approved). Scope: backlog P1b, plus the P2 items that live in the same three
components only where the fix is copy-level. Tiles, toolbar and footer stay in the later staff-home distill. No code
yet.

## Job and audience

Coordinators and coordinator leads triage and move cases all day. Consultants review assigned cases. Operations and
finance staff act on their stage. They work on desktop, return many times a day, and depend on labels that are
correct about **who** must act. Mode: Operate.

## Outcome and proof

- **Success:** every label states the actor from the viewer's point of view. Counts read naturally in both
  languages. No internal value reaches the screen.
- **Evidence:** the backend's action contract stays authoritative and the UI only words it:
  - `currentAction`, `waitingOn` and `availableActions` from the case actions;
  - `coordinatorSubject` / `coordinatorName`;
  - priority and careCategory keys.

## Selected direction

This is copy and logic only, inside the existing layouts. No visual restructure in this pass.

1. **Viewer-relative actor.** One helper resolves the actor against the signed-in subject and role:
   - the viewer is the coordinator or owner → "you" / "أنت";
   - the viewer is the assigned Consultant → "you";
   - otherwise → the person's name, or a role noun ("the coordinator", "the Consultant").

   It's used by:
   - `CurrentAction` ("Owned by another coordinator" only when that is true for this viewer; a Consultant sees "The
     case coordinator owns this case");
   - `MyWork` ("Waiting on: you");
   - `CaseQueue` (coordinator column).
2. **Missing name fallback:**
   - if the viewer owns the case → "You";
   - if someone else does → "Coordinator (name not set)";
   - "Unassigned" only when there is truly no `coordinatorSubject`.
3. **Plurals:** `Intl.PluralRules` (en, ar; Arabic has zero/one/two/few/many/other forms) behind one small helper.
   It replaces "1 cases", "1 work items" and "1 documents" in all three components.
4. **Enums to words:** mapping tables, falling back to a readable label and never the raw key:
   - priority `LOW`/`NORMAL`/`HIGH`/`URGENT` → "Low"/"Normal"/"High"/"Urgent" (ar);
   - careCategory keys → the care-area titles already in the dictionaries (`careAreasPage` / catalog).
5. **Terminology:**
   - "Assign a verified consultant…" → "Assign a Consultant for this care area";
   - capital-C "Consultant" everywhere in staff copy;
   - "consultant" → "Consultant" in the Arabic equivalents where the term is translated, unchanged otherwise.
6. **Case title fallback:** when there is no patient name, show "Case RS-…" once, not the number as both title and
   meta.
7. **Copy location:** these components hold inline `ar ? … : …` objects. The pipeline requires every string in
   `messages/en.json` and `messages/ar.json`, so move the strings these three components show into a
   `portal.work` namespace and pass the dictionary (or a typed slice) down from `Portal`. Same keys in both files.

## Scope and boundaries

- **Files:**
  - `components/portal/CurrentAction.tsx`, `MyWork.tsx`, `CaseQueue.tsx`;
  - a small `lib/portal-labels.ts` (actor, plural, enum helpers) with unit tests;
  - `messages/*.json`;
  - the `Portal.tsx` props wiring only.
- **Untouched:**
  - queue logic, sorting and filtering;
  - tabs, stat tiles and the toolbar (P2 distill later);
  - API calls;
  - authorization decisions (the UI only words what the backend says).
- **Anti-goals:** no new controls; no restyle; no guessing at an actor the backend hasn't named.

## States and ranges

- Viewer roles: coordinator, coordinator lead (team rows owned by others), Consultant (DOCTOR), operations,
  finance.
- Cases with and without a patient name or coordinator name; counts 0, 1, 2, 3–10, 11+ (Arabic plural forms).
- Unknown enum keys from a newer backend.
- Long Arabic names in table cells.

## Interaction and layout

Unchanged. Labels must fit the existing columns at 1440px and the phone row layout at 390px, in Arabic too.

## Constraints and open decisions (GATE 2)

- Confirm the Consultant-facing wording for cases owned by a coordinator ("The case coordinator owns this case").
- Confirm moving these components' inline copy into `messages/*.json` in this pass (recommended, as the epic rule
  requires), or deferring it.
- Arabic plural and priority wording needs native review, which is pending project-wide.
