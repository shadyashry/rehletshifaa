"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, CircleCheck, Info, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";

import { COUNTRIES, flagEmoji } from "@/lib/countries";
import { intlLocale, type Locale } from "@/lib/i18n";
import { apiUrl } from "@/lib/api";
import { CoordinationDepositTerms } from "@/components/CoordinationDepositTerms";
import { DEPOSIT_TERMS_CONSENT } from "@/lib/commercial-terms";
import type { Dictionary } from "@/lib/dictionary";
import { fillTemplate } from "@/lib/portal-labels";
import { OneTimeCodeStep } from "@/components/OneTimeCodeStep";
import { DossierPage } from "@/components/brand/DossierPage";
import { scrollIntoView } from "@/lib/scroll";

type Summary = { caseNumber: string; purpose: string; channel: string; destinationHint: string };
type Deposit = {
  required: boolean; status: string; currency: string;
  amountDue: number | null; amountPaid: number | null; balance: number | null; satisfied: boolean;
};
type AccountStatus = "NOT_PROVISIONED" | "SETUP_PENDING" | "ACTIVE";
type Account = { status: AccountStatus; emailHint: string | null; awaitingEmail: boolean; emailSent: boolean };
type Prefill = {
  caseNumber: string; caseStatus: string; onboardingState: string | null; profileActive: boolean; accountLinked: boolean; account: Account;
  givenName: string | null; familyName: string | null; preferredName: string | null;
  candidateEmail: string | null; emailVerified: boolean;
  knownMobile: string | null; mobileOwner: "PATIENT" | "REPRESENTATIVE" | null; phoneVerified: boolean;
  dateOfBirth: string | null; nationality: string | null; countryOfResidence: string | null; preferredLanguage: string | null; sex: string | null;
  submittedBy: "PATIENT" | "REPRESENTATIVE"; representativeName: string | null; representativeRelationship: string | null;
  requiredConsents: string[]; completedConsents: string[]; deposit: Deposit;
  currentAction?: PatientAction; journeyStage?: JourneyStage; waitingOn?: string | null;
};
type FieldError = { field: string; message: string };
/** A failed call: the HTTP status, the backend's stable code and the fields it names; its English messages are never shown. */
type Failure = { status: number; code?: string; errors?: FieldError[] };
/** Codes that mean this case can no longer be activated from the link (closed, onboarding stopped or not started). */
const INACTIVE = new Set(["CASE_NOT_ACTIVATABLE", "ONBOARDING_NOT_ACTIVE", "ONBOARDING_NOT_STARTED"]);
/** The fields in the order the form shows them, so focus goes to the first one in error. */
const FIELD_ORDER = ["givenName", "familyName", "preferredName", "dateOfBirth", "sex", "nationality", "countryOfResidence", "email", "mobileOwner", "phone", "preferredLanguage", "consents"];
const fieldId = (field: string) => `act-${field}`;
type Form = {
  givenName: string; familyName: string; singleLegalName: boolean; preferredName: string;
  email: string; emailChoice: "candidate" | "other"; phone: string; mobileOwner: "PATIENT" | "REPRESENTATIVE" | "";
  dateOfBirth: string; nationality: string; countryOfResidence: string; preferredLanguage: string; sex: string;
};

/** The page's words, from messages/{en,ar}.json (`secureLink.activation`), passed by the server page. */
export type ActivationCopy = Dictionary["secureLink"]["activation"];

/**
 * The deposit consent is legal wording: English is read from lib/commercial-terms, the Arabic kept verbatim beside it
 * until the legal review. Every other consent's words are `secureLink.activation.consents`.
 */
const DEPOSIT_CONSENT = { en: DEPOSIT_TERMS_CONSENT, ar: "قرأت وأقبل شروط وديعة التنسيق والإلغاء والاسترداد." };

type PatientAction = "COMPLETE_PROFILE" | "SET_UP_ACCOUNT" | "NONE" | "CONTINUE_IN_PORTAL";
type JourneyStage = "PROFILE" | "ACCOUNT_SETUP" | "DEPOSIT" | "CARE_COORDINATION";
/** "account" is the setup-pending screen; "activated" is the moment the profile is finished, "done" a return visit after it. */
type Stage = "loading" | "verify" | "form" | "account" | "activated" | "done" | "invalid";

/**
 * Fall back to the profile step whenever the server has not named an action: stranding someone on a
 * payment screen is the one wrong answer here, and an incomplete profile is the safe assumption.
 */
function resolveAction(data: { currentAction?: PatientAction; profileActive: boolean; deposit: Deposit; account?: Account }): PatientAction {
  if (data.currentAction) return data.currentAction;
  if (!data.profileActive) return "COMPLETE_PROFILE";
  if (data.account && data.account.status !== "ACTIVE" && data.account.awaitingEmail) return "SET_UP_ACCOUNT";
  return data.deposit.satisfied ? "CONTINUE_IN_PORTAL" : "NONE";
}

/** Resume exactly where the server says the patient stands, so a reload never reopens a finished step. */
function stageFor(action: PatientAction): Stage {
  if (action === "COMPLETE_PROFILE") return "form";
  if (action === "SET_UP_ACCOUNT") return "account";
  // Everything else continues in My Care, the deposit included (DEP-3); the ready page says what is still owed.
  return "done";
}

export function ProfileActivation({ locale, token, copy: t, guardianConsent }: { locale: Locale; token: string; copy: ActivationCopy; /** P1-13: the GUARDIAN_AUTHORIZATION wording, from `guardianConsent.text`. */ guardianConsent?: string }) {

  const [stage, setStage] = useState<Stage>("loading");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [channel, setChannel] = useState<"WHATSAPP" | "EMAIL">("WHATSAPP");
  const [codeSent, setCodeSent] = useState(false);
  const [grant, setGrant] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [deposit, setDeposit] = useState<Deposit | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [consents, setConsents] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  /** A failure of the current step (the code step shows it under its field; the others beside their action). */
  const [notice, setNotice] = useState<string | null>(null);
  /** Why the link no longer opens activation (case closed, onboarding stopped); the generic line otherwise. */
  const [invalidReason, setInvalidReason] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  /** The grant lapsed while a later step was open: the sealed page says so, without an error tone. */
  const [sessionNote, setSessionNote] = useState(false);
  const [busy, setBusy] = useState(false);
  // Counts successful sends: each starts a fresh code (the typed code is kept when a resend fails).
  const [codeRound, setCodeRound] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusAfterErrors = useRef<string | null>(null);

  // Move focus to the new step heading so keyboard and screen-reader users follow the flow.
  useEffect(() => { if (stage !== "loading") headingRef.current?.focus(); }, [stage]);
  // The first field in error takes focus once its message is on screen.
  useEffect(() => {
    const id = focusAfterErrors.current;
    focusAfterErrors.current = null;
    if (id) (document.getElementById(id) ?? (id === fieldId("phone") ? document.getElementById(fieldId("mobileOwner")) : null))?.focus();
  }, [fieldErrors]);

  const call = useCallback(async (path: string, body?: unknown) => {
    const response = await fetch(apiUrl(`/public/onboarding/${encodeURIComponent(token)}${path}`), {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    if (!response.ok) {
      const problem = await response.json().catch(() => null);
      throw { status: response.status, code: problem?.code, errors: problem?.errors as FieldError[] | undefined } satisfies Failure;
    }
    return response.json();
  }, [token]);

  useEffect(() => {
    let live = true;
    call("").then((data: Summary) => {
      if (!live) return;
      setSummary(data);
      setChannel(data.channel === "EMAIL" ? "EMAIL" : "WHATSAPP");
      setStage("verify");
    }).catch(() => { if (live) setStage("invalid"); });
    return () => { live = false; };
  }, [call]);

  /**
   * A failure in the patient's words, from the backend's stable code (never its English message). A link or case that
   * can no longer be activated ends on the invalid page with the reason; null means the page moved there.
   */
  function describe(e: unknown): string | null {
    const err = e as Failure;
    if (err?.code === "CASE_LINK_INVALID") { setInvalidReason(null); setStage("invalid"); return null; }
    if (err?.code && INACTIVE.has(err.code)) { setInvalidReason(t.invalidInactive); setStage("invalid"); return null; }
    // The short-lived grant lapsed on a later step: verify again, keeping everything typed.
    if (err?.status === 401 && grant) { expireSession(); return null; }
    if (err?.status === 429) return t.tooMany;
    if (err?.code === "VERIFICATION_INVALID") return t.codeInvalid;
    return t.error;
  }

  function expireSession() { setGrant(null); setCodeSent(false); setStage("verify"); setNotice(null); setSessionNote(true); }

  async function sendCode(next?: "WHATSAPP" | "EMAIL") {
    if (busy) return;
    setBusy(true); setNotice(null); setSessionNote(false);
    try {
      const chosen = next ?? channel;
      const data: Summary = await call("/request-access", { channel: chosen });
      setSummary(data); setChannel(chosen); setCodeSent(true); setCodeRound(round => round + 1);
    } catch (e) { setNotice(describe(e)); } finally { setBusy(false); }
  }

  async function verify(code: string) {
    if (busy || code.length !== 6) return;
    setBusy(true); setNotice(null);
    try {
      const granted: { grant: string } = await call("/verify", { code });
      const data: Prefill = await call("/profile", { grant: granted.grant });
      setGrant(granted.grant);
      setPrefill(data);
      setDeposit(data.deposit);
      setAccount(data.account);
      const repOwned = data.mobileOwner === "REPRESENTATIVE";
      // Keep anything already typed: re-verifying after a timeout must never discard the patient's work.
      setForm(previous => previous ?? {
        givenName: data.givenName ?? "",
        familyName: data.familyName ?? "",
        singleLegalName: !!data.givenName && !data.familyName,
        preferredName: data.preferredName ?? "",
        email: data.candidateEmail ?? "",
        emailChoice: data.candidateEmail ? "candidate" : "other",
        phone: repOwned ? "" : (data.knownMobile ?? ""),
        mobileOwner: data.mobileOwner ?? "",
        dateOfBirth: data.dateOfBirth ?? "",
        nationality: data.nationality ?? "",
        countryOfResidence: data.countryOfResidence ?? "",
        preferredLanguage: data.preferredLanguage ?? locale,
        sex: data.sex ?? "",
      });
      setConsents(previous => previous.length ? previous : data.completedConsents.filter(c => data.requiredConsents.includes(c)));
      setStage(stageFor(resolveAction(data)));
    } catch (e) { setNotice(describe(e)); } finally { setBusy(false); }
  }

  /**
   * A first pass so obvious mistakes are caught without a round-trip. The backend re-validates everything
   * and remains authoritative; this only mirrors its rules for a faster, calmer correction loop.
   */
  function checkLocally(values: Form, agreed: string[], required: string[], knownMobile: string | null): Record<string, string> {
    const e: Record<string, string> = {};
    if (values.givenName.trim().length < 1) e.givenName = t.errGiven;
    if (!values.familyName.trim() && !values.singleLegalName) e.familyName = t.errFamily;
    if (!values.dateOfBirth) e.dateOfBirth = t.errDob;
    else if (values.dateOfBirth > new Date().toISOString().slice(0, 10)) e.dateOfBirth = t.errDobFuture;
    if (!values.sex) e.sex = t.errSelect;
    if (!values.nationality) e.nationality = t.errSelect;
    if (!values.countryOfResidence) e.countryOfResidence = t.errSelect;
    // With no number on file the only question is the patient's own number; the owner question exists only for a known one.
    if (!values.mobileOwner) { if (knownMobile) e.mobileOwner = t.errOwner; else e.phone = t.errPhone; }
    const phone = values.phone.replace(/[^\d+]/g, "");
    if (values.mobileOwner === "PATIENT" && !/^\+[1-9]\d{6,14}$/.test(phone)) e.phone = t.errPhone;
    if (values.mobileOwner === "REPRESENTATIVE" && phone && !/^\+[1-9]\d{6,14}$/.test(phone)) e.phone = t.errPhone;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email.trim())) e.email = t.errEmail;
    if (required.some(type => !agreed.includes(type))) e.consents = t.errConsents;
    // An agreement this page has no words for cannot be accepted here.
    if (required.some(type => !consentWords(type))) e.consents = t.consentBlocked;
    return e;
  }

  /** The backend names the field; the words are this page's (its own messages are English and staff-worded). */
  function fieldMessage(field: string, values: Form): string {
    switch (field) {
      case "givenName": return values.givenName.trim() ? t.errNameInvalid : t.errGiven;
      case "familyName": return values.familyName.trim() ? t.errNameInvalid : t.errFamily;
      case "preferredName": return t.errNameInvalid;
      case "dateOfBirth": return values.dateOfBirth ? t.errDobInvalid : t.errDob;
      case "mobileOwner": return t.errOwner;
      case "phone": return t.errPhone;
      case "email": return t.errEmail;
      case "consents": return t.errConsents;
      default: return t.errSelect;
    }
  }

  /** Shows the errors beside their fields and moves focus to the first one, in the order the form shows them. */
  function showErrors(found: Record<string, string>) {
    const first = FIELD_ORDER.find(field => found[field]);
    focusAfterErrors.current = first ? fieldId(first) : null;
    setFieldErrors(found);
  }

  async function activate(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !form || !grant || !prefill) return;
    const local = checkLocally(form, consents, prefill.requiredConsents, prefill.knownMobile);
    if (Object.keys(local).length) { setNotice(null); showErrors(local); return; }
    setBusy(true); setNotice(null); setFieldErrors({});
    try {
      const profile = {
        givenName: form.givenName, familyName: form.familyName, singleLegalName: form.singleLegalName, preferredName: form.preferredName || null,
        email: form.email, phone: form.phone || null, mobileOwner: form.mobileOwner || null,
        dateOfBirth: form.dateOfBirth, nationality: form.nationality, countryOfResidence: form.countryOfResidence,
        preferredLanguage: form.preferredLanguage, sex: form.sex, consents,
      };
      const result: { profileActive: boolean; deposit: Deposit; account: Account; currentAction?: PatientAction } = await call("/activate", { grant, profile });
      setDeposit(result.deposit);
      setAccount(result.account);
      const resolved = resolveAction(result);
      // Profile complete → account setup is the very next screen. Only an already-active account skips it.
      setStage(resolved === "SET_UP_ACCOUNT" ? "account" : "activated");
    } catch (e) {
      const err = e as Failure;
      const named = (err?.errors ?? []).map(x => x.field.replace(/^profile\./, "")).filter(field => FIELD_ORDER.includes(field));
      if (named.length) showErrors(Object.fromEntries(named.map(field => [field, fieldMessage(field, form)])));
      else setNotice(describe(e));
    } finally { setBusy(false); }
  }

  async function resendSetup() {
    if (busy || !grant) return;
    setBusy(true); setNotice(null); setResent(false);
    try {
      const data: Account = await call("/resend-setup", { grant });
      setAccount(data);
      if (data.status === "ACTIVE") setStage("activated");
      else setResent(true);
    } catch (e) { setNotice(describe(e)); } finally { setBusy(false); }
  }

  /**
   * Continue into the authenticated portal using the account the patient set up, on this case.
   */
  async function openPortal() {
    if (busy || !grant) return;
    setBusy(true); setNotice(null);
    try {
      const handoff: { alreadyLinked: boolean; account: Account; caseId: string } = await call("/portal-access", { grant });
      setAccount(handoff.account);
      if (!handoff.alreadyLinked && handoff.account.awaitingEmail) { setStage("account"); setBusy(false); return; }
      const portal = `/${locale}/portal?case=${encodeURIComponent(handoff.caseId)}`;
      window.location.assign(`${portal}&signin=1`);
    } catch (e) { setNotice(describe(e)); setBusy(false); }
  }

  function consentWords(type: string): string | null {
    if (type === "GUARDIAN_AUTHORIZATION" && guardianConsent) return guardianConsent;
    return type === "DEPOSIT_CANCELLATION_TERMS" ? DEPOSIT_CONSENT[locale] : (t.consents as Record<string, string>)[type] ?? null;
  }

  const stepIndex = stage === "verify" ? 0 : stage === "form" ? 1 : 2;
  const caseNumber = prefill?.caseNumber ?? summary?.caseNumber ?? null;
  const heading = (text: string) => <h1 ref={headingRef} tabIndex={-1} className="statement mt-5 text-brand-900 outline-none">{text}</h1>;
  const failureLine = (id: string) => notice ? <p id={id} role="alert" className="mt-3 text-[0.9375rem] font-semibold leading-6 text-alert-800">{notice}</p> : null;

  if (stage === "loading") return <Shell locale={locale}><DossierPage className={PAGE_PAD}><p role="status" className="text-ink-600">{t.loading}</p></DossierPage></Shell>;
  if (stage === "invalid") return (
    <Shell locale={locale}>
      <DossierPage className={PAGE_PAD}>
        <LockKeyhole aria-hidden size={28} className="text-ink-400"/>
        {heading(t.invalidTitle)}
        <p className="mt-3 max-w-[65ch] text-ink-600">{invalidReason ?? t.invalid}</p>
      </DossierPage>
    </Shell>
  );

  const repOwned = form?.mobileOwner === "REPRESENTATIVE";
  const relationshipLabel = prefill?.representativeRelationship ? ((t.relationship as Record<string, string>)[prefill.representativeRelationship] ?? t.relationship.OTHER) : "";
  // The deposit is the patient's to pay in My Care (DEP-3); until it is, it is the next step, never a finished one.
  const depositOwed = !!deposit?.required && !deposit.satisfied;
  const depositLine = !deposit ? null : !deposit.required || deposit.status === "WAIVED" ? t.stepDepositWaived : deposit.satisfied ? t.stepDeposit : null;
  const accountActive = account?.status === "ACTIVE";
  const finished = [t.stepProposal, t.stepProfile, ...(accountActive ? [t.stepAccount] : []), ...(depositLine ? [depositLine] : [])];
  // A return visit once the deposit is in: the coordination is underway. Otherwise the profile is ready, saying only what is.
  const underway = stage === "done" && !depositOwed;
  const ready = underway ? { title: t.doneTitle, intro: t.doneIntro } : { title: t.readyTitle, intro: accountActive ? t.readyIntro : t.readyIntroProfile };
  const amountOwed = depositOwed && deposit ? deposit.balance ?? deposit.amountDue : null;
  const errorOf = (field: string) => fieldErrors[field] ? <p id={`${fieldId(field)}-error`} className="error-text mt-2 text-[0.875rem] font-semibold">{fieldErrors[field]}</p> : null;
  const invalidProps = (field: string, help = false) => {
    const describedBy = [help ? `${fieldId(field)}-help` : "", fieldErrors[field] ? `${fieldId(field)}-error` : ""].join(" ").trim();
    return { "aria-invalid": fieldErrors[field] ? true : undefined, "aria-describedby": describedBy || undefined };
  };

  return (
    <Shell locale={locale}>
      {stage !== "done" && stage !== "activated" && <Steps labels={t.steps} current={stepIndex} counter={t.stepCounter} completed={t.stepCompleted} />}

      {stage === "verify" && (
        // The sealed page: the case it belongs to, where the code goes, one action.
        <DossierPage className={PAGE_PAD} kicker={caseNumber ? t.caseLabel : null} reference={caseNumber}>
          {heading(t.verifyTitle)}
          {sessionNote && (
            <p role="status" className="mt-3 flex items-start gap-2.5 text-[0.9375rem] leading-6 text-ink-700">
              <Info aria-hidden size={18} className="mt-0.5 flex-none text-brand-600"/>{t.sessionExpired}
            </p>
          )}
          <div className="mt-4 border-t border-line pt-5">
            {/* This endpoint accepts a channel: before a code is sent the other one is offered (and sends there). */}
            <OneTimeCodeStep round={codeRound} error={notice}
                             copy={{ sendTo: t.verifyIntro, sentTo: t.codeSent, send: t.sendCode, sending: t.sending, codeLabel: t.codeLabel, verify: t.verify, verifying: t.verifying, resend: t.resend, incomplete: t.codeIncomplete }}
                             destination={summary?.destinationHint} sent={codeSent} busy={busy}
                             notice={codeSent && codeRound > 1 ? t.codeResent : null}
                             onSend={() => void sendCode()} onVerify={code => void verify(code)}
                             channelSwitch={codeSent ? null : { label: channel === "WHATSAPP" ? t.useEmail : t.useWhatsapp, onSwitch: () => void sendCode(channel === "WHATSAPP" ? "EMAIL" : "WHATSAPP") }}>
              <p className="mt-2 flex items-start gap-2 text-[0.9375rem] leading-6 text-ink-600">
                <ShieldCheck className="mt-0.5 flex-none text-brand-600" size={17} aria-hidden/>{t.neverAsk}
              </p>
            </OneTimeCodeStep>
          </div>
        </DossierPage>
      )}

      {stage === "form" && form && prefill && (
        <DossierPage edge="tab" className={PAGE_PAD} kicker={t.caseLabel} reference={prefill.caseNumber}>
          <form onSubmit={activate} noValidate>
            {heading(t.formTitle)}
            <p className="lead mt-3">{t.formIntro}</p>
            {prefill.submittedBy === "REPRESENTATIVE" && prefill.representativeName && (
              <p className="mt-4 flex items-start gap-2.5 border-t border-line pt-4 text-[0.9375rem] leading-6 text-ink-700">
                <UserRound aria-hidden size={18} className="mt-0.5 flex-none text-brand-600"/>
                <span>{fillTemplate(t.submittedByRep, { name: `⁨${prefill.representativeName}⁩`, relationship: relationshipLabel })}</span>
              </p>
            )}

            <Fieldset legend={t.sectionAbout}>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field htmlFor={fieldId("givenName")} label={t.givenName} required requiredLabel={t.required} error={errorOf("givenName")} hint={prefill.givenName ? t.prefilledNote : undefined}>
                  <input id={fieldId("givenName")} maxLength={80} spellCheck={false} className={`field ${fieldErrors.givenName ? "field-error" : ""}`} autoComplete="given-name" dir="auto" {...invalidProps("givenName")}
                         value={form.givenName} onChange={e => setForm({ ...form, givenName: e.target.value })} />
                </Field>
                <Field htmlFor={fieldId("familyName")} label={form.singleLegalName ? `${t.familyName} (${t.optional})` : t.familyName} required={!form.singleLegalName} requiredLabel={t.required} error={errorOf("familyName")} hint={prefill.familyName ? t.prefilledNote : undefined}>
                  <input id={fieldId("familyName")} maxLength={80} spellCheck={false} className={`field ${fieldErrors.familyName ? "field-error" : ""}`} autoComplete="family-name" dir="auto" {...invalidProps("familyName")}
                         value={form.familyName} onChange={e => setForm({ ...form, familyName: e.target.value })} />
                </Field>
              </div>
              <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[0.9375rem] text-ink-700"><input type="checkbox" className="h-5 w-5 flex-none accent-brand-600" checked={form.singleLegalName} onChange={e => setForm({ ...form, singleLegalName: e.target.checked })} />{t.singleName}</label>
              <p className="text-[0.875rem] leading-6 text-ink-600">{t.namesHelp}</p>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field htmlFor={fieldId("preferredName")} label={`${t.preferredName} (${t.optional})`} error={errorOf("preferredName")}>
                  <input id={fieldId("preferredName")} maxLength={80} spellCheck={false} className={`field ${fieldErrors.preferredName ? "field-error" : ""}`} autoComplete="nickname" dir="auto" {...invalidProps("preferredName")}
                         value={form.preferredName} onChange={e => setForm({ ...form, preferredName: e.target.value })} />
                </Field>
                <Field htmlFor={fieldId("dateOfBirth")} label={t.dateOfBirth} required requiredLabel={t.required} error={errorOf("dateOfBirth")}>
                  <input id={fieldId("dateOfBirth")} type="date" dir="ltr" className={`field ${fieldErrors.dateOfBirth ? "field-error" : ""}`} {...invalidProps("dateOfBirth")}
                         max={new Date().toISOString().slice(0, 10)} autoComplete="bday"
                         value={form.dateOfBirth} onChange={e => setForm({ ...form, dateOfBirth: e.target.value })} />
                </Field>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field htmlFor={fieldId("sex")} label={t.sex} required requiredLabel={t.required} help={t.sexHelp} error={errorOf("sex")}>
                  <select id={fieldId("sex")} className={`field ${fieldErrors.sex ? "field-error" : ""}`} value={form.sex} {...invalidProps("sex", true)}
                          onChange={e => setForm({ ...form, sex: e.target.value })}>
                    <option value="">{t.selectOption}</option>
                    <option value="MALE">{t.male}</option>
                    <option value="FEMALE">{t.female}</option>
                    <option value="OTHER">{t.other}</option>
                    <option value="UNDISCLOSED">{t.undisclosed}</option>
                  </select>
                </Field>
                <Field htmlFor={fieldId("nationality")} label={t.nationality} required requiredLabel={t.required} error={errorOf("nationality")}>
                  <CountrySelect id={fieldId("nationality")} value={form.nationality} placeholder={t.selectCountry} empty={t.noCountry}
                                 invalid={!!fieldErrors.nationality} describedBy={fieldErrors.nationality ? `${fieldId("nationality")}-error` : undefined}
                                 onChange={v => setForm({ ...form, nationality: v })} />
                </Field>
              </div>
              <Field htmlFor={fieldId("countryOfResidence")} label={t.residence} required requiredLabel={t.required} error={errorOf("countryOfResidence")} hint={prefill.countryOfResidence ? t.prefilledNote : undefined}>
                <CountrySelect id={fieldId("countryOfResidence")} value={form.countryOfResidence} placeholder={t.selectCountry} empty={t.noCountry}
                               invalid={!!fieldErrors.countryOfResidence} describedBy={fieldErrors.countryOfResidence ? `${fieldId("countryOfResidence")}-error` : undefined}
                               onChange={v => setForm({ ...form, countryOfResidence: v })} />
              </Field>
            </Fieldset>

            <Fieldset legend={t.sectionContact}>
              {/* Account email: mandatory, security-sensitive. A known address is offered, never assumed. */}
              <div>
                <p className="flex flex-wrap items-center gap-2 text-[0.9375rem] font-bold text-ink-800"><span id="act-email-label">{t.accountEmail}</span><span className="text-alert-700"><span aria-hidden>*</span><span className="sr-only"> {t.required}</span></span></p>
                <p className="mt-1 text-[0.875rem] leading-6 text-ink-600">{t.accountEmailHelp}</p>
                {prefill.candidateEmail && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-labelledby="act-email-label" aria-required="true">
                    <ChoiceCard name="emailChoice" checked={form.emailChoice === "candidate"} id={form.emailChoice === "candidate" ? fieldId("email") : undefined}
                                invalid={form.emailChoice === "candidate" && !!fieldErrors.email} describedBy={form.emailChoice === "candidate" && fieldErrors.email ? `${fieldId("email")}-error` : undefined}
                                onChange={() => setForm({ ...form, emailChoice: "candidate", email: prefill.candidateEmail ?? "" })}>
                      <span className="block">{t.useThisEmail}</span>
                      <span className="block text-[0.875rem] font-normal text-ink-600">
                        <bdi dir="ltr">{maskEmail(prefill.candidateEmail)}</bdi>{prefill.emailVerified && <> · {t.emailVerifiedNote}</>}
                      </span>
                    </ChoiceCard>
                    <ChoiceCard name="emailChoice" checked={form.emailChoice === "other"}
                                onChange={() => setForm({ ...form, emailChoice: "other", email: "" })}>
                      {t.useAnotherEmail}
                    </ChoiceCard>
                  </div>
                )}
                {(!prefill.candidateEmail || form.emailChoice === "other") && (
                  <div className="mt-3">
                    <Field htmlFor={fieldId("email")} label={t.emailOther} required requiredLabel={t.required} error={errorOf("email")}>
                      <input id={fieldId("email")} maxLength={254} spellCheck={false} className={`field ${fieldErrors.email ? "field-error" : ""}`} type="email" dir="ltr" inputMode="email" {...invalidProps("email")}
                             autoComplete="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                    </Field>
                  </div>
                )}
                {prefill.candidateEmail && form.emailChoice === "candidate" && errorOf("email")}
              </div>

              {/* Mobile: shown as known, ownership made explicit; never promoted to the patient by default. */}
              <div className="border-t border-line pt-5">
                <p className="text-[0.9375rem] font-bold text-ink-800">{t.phone}</p>
                {prefill.knownMobile && (
                  <>
                    <p className="mt-1 text-[0.9375rem] text-ink-700"><bdi dir="ltr" className="font-semibold text-ink-900">{prefill.knownMobile}</bdi> <span className="text-[0.875rem] text-ink-500">· {t.prefilledNote}</span></p>
                    <p className="mt-3 text-[0.9375rem] font-semibold text-ink-800" id="act-owner-label">{t.belongsTo}</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-labelledby="act-owner-label" aria-required="true">
                      {([["PATIENT", t.ownerMe], ["REPRESENTATIVE", t.ownerRep]] as const).map(([key, label], index) => (
                        <ChoiceCard key={key} name="mobileOwner" checked={form.mobileOwner === key} id={index === 0 ? fieldId("mobileOwner") : undefined}
                                    invalid={index === 0 && (!!fieldErrors.mobileOwner || (!!fieldErrors.phone && !repOwned))}
                                    describedBy={index === 0 ? [fieldErrors.mobileOwner ? `${fieldId("mobileOwner")}-error` : "", fieldErrors.phone && !repOwned ? `${fieldId("phone")}-error` : ""].join(" ").trim() || undefined : undefined}
                                    onChange={() => setForm({ ...form, mobileOwner: key, phone: key === "PATIENT" ? (prefill.knownMobile ?? "") : "" })}>
                          {label}
                        </ChoiceCard>
                      ))}
                    </div>
                    {errorOf("mobileOwner")}
                    {repOwned && <p className="mt-2 text-[0.875rem] leading-6 text-ink-600">{fillTemplate(t.ownerRepKnown, { number: `⁦${prefill.knownMobile}⁩` })} {t.ownerRepHelp}</p>}
                  </>
                )}
                {(!prefill.knownMobile || repOwned) && (
                  <div className="mt-3">
                    <Field htmlFor={fieldId("phone")} label={repOwned ? `${t.yourOwnPhone} (${t.phoneOptional})` : t.phone} required={!repOwned} requiredLabel={t.required} help={t.phoneHelp} error={errorOf("phone")}>
                      <input id={fieldId("phone")} type="tel" maxLength={32} className={`field ${fieldErrors.phone ? "field-error" : ""}`} dir="ltr" inputMode="tel" autoComplete="tel" {...invalidProps("phone", true)}
                             value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value, mobileOwner: form.mobileOwner || "PATIENT" })} />
                    </Field>
                  </div>
                )}
                {prefill.knownMobile && form.mobileOwner === "PATIENT" && errorOf("phone")}
              </div>

              <Field htmlFor={fieldId("preferredLanguage")} label={t.language} error={errorOf("preferredLanguage")}>
                <select id={fieldId("preferredLanguage")} className={`field ${fieldErrors.preferredLanguage ? "field-error" : ""}`} value={form.preferredLanguage} {...invalidProps("preferredLanguage")}
                        onChange={e => setForm({ ...form, preferredLanguage: e.target.value })}>
                  <option value="en">{t.english}</option>
                  <option value="ar">{t.arabic}</option>
                </select>
              </Field>
            </Fieldset>

            <Fieldset legend={t.sectionAgreements}>
              {errorOf("consents")}
              <ul className="space-y-3">
                {prefill.requiredConsents.map((type, index) => {
                  const checked = consents.includes(type);
                  // The patient accepts deposit terms only with those terms in front of them, on this page.
                  const depositTermsConsent = type === "DEPOSIT_CANCELLATION_TERMS";
                  const dep = prefill.deposit;
                  // A consent with no words on this page is named generically, never by its code.
                  const words = consentWords(type);
                  return (
                    <li key={type}>
                      {depositTermsConsent && (
                        <div className="mb-2">
                          <CoordinationDepositTerms id="activation-deposit-terms" locale={locale} level={3}
                            amount={dep.required && dep.amountDue != null ? money(dep.amountDue, dep.currency, locale) : null}
                            currency={dep.required ? dep.currency : null} />
                        </div>
                      )}
                      <label className={`flex items-start gap-3 rounded-lg border border-ink-350 bg-white p-4 has-[:checked]:border-brand-600 ${words ? "cursor-pointer" : "cursor-not-allowed"}`}>
                        <input type="checkbox" id={index === 0 ? fieldId("consents") : undefined} className="mt-0.5 h-5 w-5 flex-none accent-brand-600" checked={checked && !!words} disabled={!words}
                               aria-describedby={[depositTermsConsent ? "activation-deposit-terms" : "", fieldErrors.consents ? `${fieldId("consents")}-error` : ""].join(" ").trim() || undefined}
                               aria-invalid={fieldErrors.consents && !checked ? true : undefined}
                               onChange={e => setConsents(v => e.target.checked ? [...v, type] : v.filter(x => x !== type))} />
                        <span className="text-[0.9375rem] leading-6 text-ink-700">{words ?? t.consentUnknown}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <p className="flex items-start gap-2.5 text-[0.9375rem] leading-6 text-ink-600">
                <Info aria-hidden size={18} className="mt-0.5 flex-none text-brand-600"/>{t.passportNote}
              </p>
            </Fieldset>

            <button className="btn-primary mt-8 w-full sm:w-auto" disabled={busy} aria-describedby={notice ? "activate-error" : undefined}>{busy ? t.activating : t.activate}</button>
            {failureLine("activate-error")}
          </form>
        </DossierPage>
      )}

      {/* Account setup: the password is created inside the identity provider from a link in the inbox. */}
      {stage === "account" && (
        <DossierPage className={PAGE_PAD} kicker={t.caseLabel} reference={caseNumber}>
          {heading(t.accountTitle)}
          <p className="lead mt-3">{t.accountIntro}</p>
          <div className="mt-6 border-t border-line pt-5">
            <p className="flex items-start gap-2.5 text-ink-800">
              <Mail aria-hidden size={18} className="mt-1 flex-none text-brand-600"/>
              <span>{account?.emailHint
                ? <>{account.emailSent === false ? t.accountNotSent : t.accountSent} <strong className="text-ink-900"><bdi dir="ltr">{account.emailHint}</bdi></strong></>
                : account?.emailSent === false ? t.accountNotSentNoAddress : t.accountSentNoAddress}</span>
            </p>
            <p className="mt-2 text-[0.9375rem] leading-6 text-ink-600">{t.accountSentHelp}</p>
          </div>
          <p role="status" className={resent ? "mt-4 text-[0.9375rem] font-semibold text-brand-800" : "sr-only"}>{resent ? t.accountResent : ""}</p>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
            <button type="button" className="btn-secondary" disabled={busy} aria-describedby={notice ? "resend-error" : undefined} onClick={() => void resendSetup()}>{busy ? t.resending : t.accountResend}</button>
          </div>
          {failureLine("resend-error")}
        </DossierPage>
      )}

      {/* Profile + account complete: what is finished, in true steps only, then the one thing still owed or the way in. */}
      {(stage === "activated" || stage === "done") && (
        <DossierPage className={PAGE_PAD} kicker={t.caseLabel} reference={caseNumber}>
          <CircleCheck aria-hidden size={28} className="mt-6 text-brand-600"/>
          {heading(ready.title)}
          <p className="lead mt-3">{ready.intro}</p>
          <ul className="mt-7 space-y-3">
            {finished.map(step => (
              <li key={step} className="flex items-center gap-3 text-ink-800">
                <span aria-hidden className="grid h-6 w-6 flex-none place-items-center rounded-full bg-brand-100 text-brand-700"><Check size={14} strokeWidth={3}/></span>
                {step}
              </li>
            ))}
          </ul>

          {depositOwed ? (
            <div className="mt-7 border-t border-line pt-5">
              <p className="eyebrow">{t.nextStepLabel}</p>
              <h2 className="title mt-1.5 text-brand-900">{t.nextPay}</h2>
              {amountOwed != null && deposit && (
                <p className="mt-1 text-ink-800">{t.amountDue}: <bdi dir="ltr" className="font-semibold tabular-nums">{money(amountOwed, deposit.currency, locale)}</bdi></p>
              )}
              <p className="mt-1 max-w-[65ch] text-[0.9375rem] leading-6 text-ink-600">{t.nextPayHow}</p>
              <button type="button" className="btn-primary mt-5 w-full sm:w-auto" disabled={busy} aria-busy={busy || undefined} aria-describedby={notice ? "portal-error" : undefined} onClick={() => void openPortal()}>
                {busy ? t.opening : t.signInToPay}
              </button>
            </div>
          ) : (<>
            {underway && <p className="mt-7 leading-7 text-ink-600">{t.portalIntro}</p>}
            {/* It opens sign-in on this case, so it says so. */}
            <button type="button" className="btn-primary mt-6 w-full sm:w-auto" disabled={busy} aria-busy={busy || undefined} aria-describedby={notice ? "portal-error" : undefined} onClick={() => void openPortal()}>
              {busy ? t.opening : t.viewJourney}
            </button>
          </>)}
          {failureLine("portal-error")}
        </DossierPage>
      )}
    </Shell>
  );
}

function maskEmail(value: string) {
  const at = value.indexOf("@");
  if (at <= 0) return value;
  const user = value.slice(0, at);
  return `${user.length <= 2 ? user[0] : user.slice(0, 2)}***${value.slice(at)}`;
}

// ---------- presentational helpers ----------

/** The page's padding, read by `.dossier-page` through `--page-pad` (its rule is unlayered, so padding utilities would lose). */
const PAGE_PAD = "[--page-pad:1.25rem] sm:[--page-pad:2rem]";

function Shell({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return (
    <section className="section section-soft">
      <div className="container-site" style={{ maxWidth: "44rem" }} lang={locale}>{children}</div>
    </section>
  );
}

/**
 * Where the patient is in completing the file, drawn with the journey's markers: reached steps filled with a check,
 * the current one ringed and marked `aria-current`, each state said in words. Labels wrap rather than truncate.
 */
function Steps({ labels, current, counter, completed }: { labels: string[]; current: number; counter: string; completed: string }) {
  return (
    <div className="mb-6">
      <ol className="care-journey flex items-center gap-2.5" aria-label={fillTemplate(counter, { number: String(current + 1), total: String(labels.length) })}>
        {labels.map((label, index) => {
          const state = index < current ? "reached" : index === current ? "current" : "upcoming";
          return (
            <li key={label} className="flex min-w-0 flex-1 items-center gap-2.5" aria-current={state === "current" ? "step" : undefined}>
              <span aria-hidden className="journey-marker flex-none" data-state={state}>
                {state === "reached" ? <Check size={15} strokeWidth={3}/> : index + 1}
              </span>
              <span className={`min-w-0 text-[0.875rem] leading-5 ${state === "current" ? "font-semibold text-brand-900" : "text-ink-600"}`}>
                {label}
                {state === "reached" && <span className="sr-only"> ({completed})</span>}
              </span>
              {index < labels.length - 1 && <span aria-hidden className="h-px min-w-3 flex-1 bg-brand-300"/>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="mt-9 min-w-0 border-0 border-t border-line p-0 pt-6">
      <legend className="eyebrow float-start mb-5 w-full">{legend}</legend>
      <div className="clear-both space-y-5">{children}</div>
    </fieldset>
  );
}

/** One field: the label names the control by `htmlFor` (never wrapping it, so a combobox's open list is not read as its name). */
function Field({ htmlFor, label, required, requiredLabel, help, hint, error, children }: {
  htmlFor: string; label: string; required?: boolean; requiredLabel?: string; help?: string; hint?: string; error?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 flex flex-wrap items-center gap-2 text-[0.9375rem] font-bold text-ink-800">
        {label}
        {required && <span className="text-alert-700"><span aria-hidden>*</span><span className="sr-only"> {requiredLabel}</span></span>}
      </label>
      {children}
      {/* The label stays one line so paired fields line up; a pre-fill note sits under its field. */}
      {hint && !error ? <p className="mt-1.5 text-[0.8125rem] text-ink-500">{hint}</p> : null}
      {help ? <p id={`${htmlFor}-help`} className="mt-2 text-[0.875rem] leading-6 text-ink-600">{help}</p> : null}
      {error}
    </div>
  );
}

/** A DESIGN.md choice card: an 8px card with its own radio; checked, it takes the petrol edge, wash and halo. */
function ChoiceCard({ name, checked, id, invalid, describedBy, onChange, children }: {
  name: string; checked: boolean; id?: string; invalid?: boolean; describedBy?: string; onChange: () => void; children: React.ReactNode;
}) {
  return (
    <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-ink-350 bg-white px-4 py-3 text-[0.9375rem] font-semibold text-ink-800 transition-[transform,border-color,box-shadow,background-color] motion-safe:hover:-translate-y-px hover:border-brand-300 has-[:checked]:border-[var(--choice-checked-border)] has-[:checked]:bg-[var(--choice-checked-bg)] has-[:checked]:shadow-[0_0_0_3px_var(--color-brand-100)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-600">
      <input type="radio" id={id} name={name} className="mt-1 h-4 w-4 flex-none accent-brand-600" checked={checked} onChange={onChange}
             aria-invalid={invalid || undefined} aria-describedby={describedBy} />
      <span className="min-w-0">{children}</span>
    </label>
  );
}

function CountrySelect({ id, value, placeholder, empty, invalid, describedBy, onChange }: {
  id?: string; value: string; placeholder: string; empty: string; invalid?: boolean; describedBy?: string; onChange: (iso2: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = useMemo(() => COUNTRIES.find(c => c.iso2 === value), [value]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? COUNTRIES.filter(c => c.name.toLowerCase().includes(q) || c.iso2.toLowerCase() === q) : COUNTRIES;
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function choose(iso2: string) { onChange(iso2); setQuery(""); setOpen(false); }
  const activeId = open && results[active] ? `${listId}-${results[active].iso2}` : undefined;
  // The highlighted option stays in view as the arrows move it.
  useEffect(() => { if (activeId) scrollIntoView(document.getElementById(activeId), { block: "nearest" }); }, [activeId]);

  return (
    <div ref={root} className="relative">
      <input
        id={id} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" autoComplete="off"
        aria-invalid={invalid || undefined} aria-describedby={describedBy} aria-activedescendant={activeId}
        onBlur={() => { setOpen(false); setQuery(""); }}
        className={`field ${invalid ? "field-error" : ""}`}
        placeholder={placeholder}
        value={open ? query : selected ? `${flagEmoji(selected.iso2)} ${selected.name}` : ""}
        onFocus={() => { setOpen(true); setActive(0); }}
        onChange={e => { setQuery(e.target.value); setActive(0); if (!open) setOpen(true); }}
        onKeyDown={e => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, results.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && open && results[active]) { e.preventDefault(); choose(results[active].iso2); }
          else if (e.key === "Escape") { setOpen(false); setQuery(""); }
        }}
      />
      {open && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-line bg-white py-1 shadow-[var(--shadow-raised)]">
          {results.length === 0 ? <li className="px-4 py-3 text-[0.875rem] text-ink-500">{empty}</li> : results.map((c, i) => (
            <li key={c.iso2} id={`${listId}-${c.iso2}`} role="option" aria-selected={c.iso2 === value}
                className={`flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-[0.875rem] ${i === active ? "bg-brand-50 font-semibold" : ""}`}
                onMouseEnter={() => setActive(i)} onMouseDown={e => { e.preventDefault(); choose(c.iso2); }}>
              <span aria-hidden className="text-lg leading-none">{flagEmoji(c.iso2)}</span>
              <span className="min-w-0 flex-1 truncate text-ink-800">{c.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function money(amount: number | null, currency: string, locale: Locale) {
  if (amount == null) return "—";
  // Decimals only when the amount has them, matching how the proposal states the same money.
  const whole = Number.isInteger(amount);
  try {
    return new Intl.NumberFormat(intlLocale(locale), {
      style: "currency", currency,
      minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2,
    }).format(amount);
  }
  catch { return `${amount.toLocaleString(intlLocale(locale))} ${currency}`; }
}
