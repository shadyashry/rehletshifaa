# Shape plan — Patient proposal experience

Status: **draft for GATE 2** (not approved). Scope: backlog P1a and the P2 nested-terms item. No code yet.

## Job and audience

A patient, or a relative acting for them, opens the proposal from My Care ("Review proposal"). They are deciding about
money and treatment abroad, often on a phone, usually in Arabic. Mode: Operate, with a Read moment.

They need to understand three things, in this order:

1. what is proposed;
2. what it is likely to cost, and how firm that number is;
3. what each decision does.

The proposal is either a preliminary estimate or a final treatment quote.

## Outcome and proof

- **Success:** the patient takes one deliberate decision in one place: acknowledge or accept, request changes, or
  decline. They know what happens next.
- **Content that must stay accurate:**
  - the Consultant's recommendation (`recommendationBlock`);
  - the items and the total (`ProposalCard`);
  - the currency, the validity date and the document type;
  - the deposit, refund and cancellation wording from `lib/commercial-terms.ts`, unchanged.

## Selected direction (inside the Petrol & Paper world)

Keep the existing **side drawer** (`CaseDrawer`) opened from My Care. This is an enhancement, not a new page, per
"enhance, don't revamp". Reorder and re-voice what it contains as one reading column:

1. **Title:** "Your proposal" / "مقترحك" (currently `t.proposal`, "Patient proposal").
2. **Header line:** the document type in plain words ("Preliminary care estimate" / "Final treatment quote"), plus
   "Valid until 31 December 2026" as a long, localised date (`Intl.DateTimeFormat`, `dateStyle: "long"`, `ar-EG`
   for Arabic). No version number and no raw status. The status, if shown at all, uses plain words from a
   patient-specific label map: RELEASED/VIEWED → "Ready for your decision", ACCEPTED → "Accepted", and so on.
3. **Price first:** the total in Display weight, then the items as a hairline list (not a table inside a card).
4. **The honesty line:** for an estimate, "This is a preliminary estimate. It can change after your in-person
   assessment." For a final quote, its own approved line.
5. **The Consultant's recommendation:** plain text with hairlines, no tinted panel.
6. **The decision:** one primary action (Acknowledge estimate / Accept quote) behind the existing acknowledgement
   checkbox. "Request changes" is secondary. "Decline" stays behind its existing disclosure and dialog.
7. **Terms behind a disclosure**, between the honesty line and the decision: "Deposit, refunds and cancellation"
   as a `<details>`/disclosure, **open by default while a decision is owed** (owner, GATE 3) and closed otherwise. The wording is unchanged and carries a "Pending legal review"
   note. The acknowledgement checkbox text points to it ("I have read the deposit, refund and cancellation terms"),
   so the decision still requires the terms to be available.

## Scope and boundaries

- **Files:**
  - `components/portal/Portal.tsx`: the drawer contents, `ProposalCard`, and `statusLabel` (or a patient-only label
    map);
  - `components/portal/CaseMessages.tsx` (`PatientProposalDecision`);
  - the display of `lib/commercial-terms.ts`;
  - `messages/en.json` and `messages/ar.json`.
- **Untouched:**
  - decision API calls and payloads;
  - the acknowledgement gating;
  - terms versions (`DEPOSIT_TERMS_VERSION`);
  - the staff proposal views.
- **Anti-goals:** no new claims; no machine-translated legal text; no second primary button; no nested cards; no
  coral text.

## States and ranges

- **Document type:** preliminary estimate or final quote.
- **Status:** ready, viewed, accepted, declined, expired, superseded. Only ready/viewed show the decision.
- **Items:** 1 to about 12 items; optional items (currently `selectedOptionalItemIds: []`); long Arabic descriptions.
- **Money:** currency USD, EGP or another; totals up to 6 digits. Use one currency format everywhere via
  `Intl.NumberFormat`, which fixes the "$US 4,850.00" / "4,850 US$" / "$4,850" drift.
- **Errors:** decision failure keeps the comment and the checkbox; expired or superseded show the existing
  explanations.
- **Arabic:** RTL, terms in English per GATE 2. Test at 390px and 1440px.

## Interaction and layout

The drawer is full-screen on phones and a side sheet on desktop. Focus moves to the title on open and returns to
"Review proposal" on close; Escape closes it. The disclosure is keyboard-operable and announced. The primary action
sits at the end of the reading order. On phones the decision block should not be pushed below a wall of terms; that
is the reason for the disclosure.

## Constraints and open decisions (GATE 2)

- **LEGAL:** English-only terms on `/ar`.
  - (A) Show them with "English only, translation pending" and allow acceptance.
  - (B) Keep the decision disabled on `/ar` until approved Arabic terms exist.
  - (C) Other.
  - Recommendation: **B**, for informed consent. If B is chosen, the Arabic drawer explains why the decision is
    unavailable and offers "Message your coordinator"; the English version stays available via the language switch.
- Does the drawer stay, or does the decision move to its own page? The recommendation is to keep the drawer for
  this pass.
- Patient status labels: confirm the plain-word mapping above.
