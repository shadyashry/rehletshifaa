# Review — RehletShifaa Users, Roles and Access Guide (Edition 1)

**Reviewed against:** `customer-governance-target-architecture-reviewed.md`, revision 3 (final), D1–D35, §24.1 business choices.
**Date:** 2026-09-25. **Output:** Edition 2 (`rehletshifaa-users-and-roles-manual-rev2.docx/.pdf`). Edition 1 is preserved unchanged.
**Build script:** `.codex-tmp/users-roles-manual/build_manual_rev2.py` (reuses `build_manual.py` helpers; writes to new names and `users-roles-manual-rev2-assets/`).

No new roles were introduced and no agreed decision was changed. Where the architecture is silent, Edition 2 says "Not yet decided" and does not invent a rule.

## Required corrections

| # | Sev | Manual section (Ed. 1) | Architecture reference | Impact | Correction applied in Ed. 2 |
|---|---|---|---|---|---|
| R1 | High | Cover, §1, whole text, §10 Tester handbook | Header ("NOT an implementation"), §1.1 ("Decided, not built"), §2, §14A.1, §26/D27 (P1) | Target presented in present tense; testers would log today's expected failures (e.g. `SYSTEM_ADMIN` still reads all medical documents, no MFA, no facilities, silent email linking) as defects | Status callout on cover; new §2 "What exists today and what is planned" (9-row comparison); tester handbook labelled "P1 acceptance tests" with instruction to record failures on today's build as "not yet built" |
| R2 | High | §5 Consultant and Associate Doctor cards — "Strong sign in" | §24.1 item 6 **confirmed at launch**; Final verdict | Contradicts a confirmed business decision | "Required at launch (confirmed business decision)"; tests AU 03 added |
| R3 | High | §2/§7 "Each provider organization independently verifies the professional level" | §10.1 `CREDENTIALING_SPECIALIST` (`credential.verify`); §14A.5 fact 2; §27.2 (provider users: own credential data only) | Implies a provider can verify its own clinicians — a separation-of-duty breach | "Verified separately for each organization by an independent RehletShifaa Credentialing Specialist; the organization cannot verify its own clinicians; evidence is not shared automatically" |
| R4 | High | Missing (only a glossary line) | D17, D29, D32, §14A.3, §14A.6, §27.2 (Omar table), §27.3 G2F item 11 | Owners and testers cannot tell provider membership from RehletShifaa central coverage; key isolation rule untested | New "Two ways to reach a provider organization" (Figure 2 + comparison table); coverage rows in lifecycle table; tests CC 01–05 |
| R5 | High | Every role card (had only "Typical handoff") | §8.1–8.2, §9.2, §10.3, §11, §13, §14A.5 fact 3, §14A.9, §14A.12 | Requirement "who grants or removes access" not met | Every card now has "Who grants it" and "Who removes it" rows |
| R6 | High | Ownership transfer absent (one table row only) | D1, D10, §8.1–8.2, §9.2 | Platform ownership transfer and recovery not explained; Organization Owner transfer/last-owner rule does not exist in the architecture | Transfer flow (Figure 4) and recovery paragraph; Organization Owner grant/removal/transfer marked **Not yet decided** (§14) |
| R7 | Medium | §7 scope table and Figure 5 ("ASSIGNED CASES"; single ladder) | §7 facility-aware scopes, D32, §14A.6 | Invents a target scope; ladder shows internal `ASSIGNED_ORGANIZATIONS` as wider than provider `ORGANIZATION` although they belong to different paths | Scope table split into provider and RehletShifaa scopes; note that case access comes from case ownership/assignment; ladder replaced by two-path diagram |
| R8 | Medium | §2 "Each organization membership can start suspend or end independently" | D34, §14A.8 (membership: revoke only; suspend exists for facility/organization) | Overstates a lifecycle state that is not defined | "Starts and ends"; per-person membership pause and self-departure listed as **Not yet decided** |
| R9 | Medium | §8 offer states ("Review required … incompatible role") | §14A.9 Collisions, Guarantees | Wrong outcome for incompatible roles; missing no-enumeration rule | Incompatible role → offer sent without that role + neutral "some roles need review"; inviter always sees "Invitation sent"; tests ID 07–08 |
| R10 | Medium | §5 Consultant "Deliver consultant services"; worked example "consult" | §2.1 (clinical family non-executable), §27.2 ("when clinical capabilities are enabled"; V-3 summary) | Overstates what clinicians can do in the first release | "Clinical work in the first release" callout |
| R11 | Medium | §5 Consultant Assistant MFA ("follows provider authentication policy"); no cross-context rule | §6.3 (non-manager provider users unaffected), D20, §14A.8 MFA classifier | Vague; misses that strong sign-in is per person across all contexts | Assistant: not required by the role itself; new "Strong sign-in belongs to the person" section with examples; AU 07 |
| R12 | Medium | §10 Tester handbook coverage | §27.3 G2F items 2, 3, 5, 7, 8, 9, 11, 12; R1 items 3, 6; G4 | Missing: central coverage, org-wide PM at new clinic, default-clinic rules, org suspension, undeclared/legacy levels, case clinic/affiliation, no-enumeration, explainability, ownership transfer, job change, offboarding, clinician MFA; no test world or prerequisites | Added prerequisites, test world, expanded personas, ~40 new tests (SC 02/06/09–11, CC, RL 07–10, AD 09–12, AU 03/04/08, OB, CX, OP 07–09) |
| R13 | Medium | Missing | §14A.13 (My Practice organization → facility selectors), §17 ("Selectors never filter authorization on the client") | Context switching for multi-organization users unexplained | New §9 with Figure 6 and rules; CX tests |
| R14 | Medium | §3 administrator appointment table | §9.2, D7, D8, D10 | Missing handover, vendor recovery, normal removal, resignation, 72 h expiry | Table completed (9 rows) + expiry note |
| R15 | Medium | §5 organization/facility rules | D28, §14A.2, §14A.7 backfill | Missing initial clinic at creation, close/suspend-default rules, and that existing organizations get an ONBOARDING default clinic needing an address | Rules added; "Existing providers after the upgrade" callout; SC 09–11 |
| R16 | Medium | Whole document; §1 | §24.1; Final verdict "Business choices" | Confirmed rules, adopted defaults and pending items indistinguishable (choices 1, 6, 9 not stated) | Label legend in §1; inline "(adopted default)"; decision-status table (15 choices) in §14 |
| R17 | Medium | Text and diagrams throughout | — (reader requirement) | Missing commas make lists ambiguous for non-technical readers (e.g. "Platform Administrator Access Governance Manager and Support Agent") | Rewritten with punctuation; questions end with "?"; diagrams relabelled |
| R18 | Low | §8 internal offboarding | §13, D14 | Who starts offboarding and the handover state were missing | Numbered steps incl. "manager or System Administrator"; job-change rule added |
| R19 | Low | §5 Practice Manager | §27.2 ("PM lacks `provider.member.invite` unless granted") | Implied PMs can invite members | "Invite members only if member invitation has been granted separately" |
| R20 | Low | §7 provider combination table | §14A.5 matrix; §24.1 item 10 | Omitted Assistant + Owner/PM (allowed) and "different organization" for Consultant + Associate | Rows added/clarified |

## Optional improvements (applied)

| # | Section | Improvement |
|---|---|---|
| O1 | §5 | Figure 2 appeared twice; replaced the duplicate with a new "one organization, several clinics" reach diagram (Figure 5) and an organization-wide vs clinic-specific table |
| O2 | Worked example | Supervisor renamed Dr Lina Mansour (architecture uses "Omar" for a RehletShifaa Credentialing Specialist) |
| O3 | Worked example | Added: owner still manages Sharjah after the Sharjah link ends; she cannot grant herself Abu Dhabi (RL 10); strong sign-in follows the person |
| O4 | §11 prices | Worked price example showing a clinic price beating a clinician's organization-wide price |
| O5 | §7 Patient Representative | Stated as existing, unchanged behaviour; relationship-based grants deferred (§6.2, §28) |
| O6 | Glossary | Added default clinic, clinic link, RehletShifaa coverage, offer, declared level, credential decision, P1 |

## Confirmed vs unresolved

- **Confirmed:** choice 6 (clinician MFA at launch), choice 9 (multi-clinic and multi-organization at launch; G2F in P1).
- **Pending:** choice 1 (EN/AR names, copy only — native-language review).
- **Adopted defaults:** choices 2–5, 7, 8, 10–15.
- **Not covered by the architecture (decision needed):**
  1. Organization Owner: who grants/removes it, minimum one active owner per organization, and ownership transfer.
  2. Temporary pause of one person's provider membership; whether a member can end their own membership.
