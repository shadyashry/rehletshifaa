"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";

import { COUNTRIES, flagEmoji } from "@/lib/countries";
import { intlLocale, type Locale } from "@/lib/i18n";
import { apiUrl } from "@/lib/api";
import { CoordinationDepositTerms } from "@/components/CoordinationDepositTerms";
import { DEPOSIT_TERMS_CONSENT } from "@/lib/commercial-terms";
import type { Dictionary } from "@/lib/dictionary";
import { fillTemplate } from "@/lib/portal-labels";
import { OneTimeCodeStep } from "@/components/OneTimeCodeStep";

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

export function ProfileActivation({ locale, token, copy: t }: { locale: Locale; token: string; copy: ActivationCopy }) {

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
  const [notice, setNotice] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState(false);
  // Each successful send starts a fresh code step (the typed code is kept when a resend fails).
  const [codeRound, setCodeRound] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the new step heading so keyboard and screen-reader users follow the flow.
  useEffect(() => { if (stage !== "loading") headingRef.current?.focus(); }, [stage]);

  const call = useCallback(async (path: string, body?: unknown) => {
    const response = await fetch(apiUrl(`/public/onboarding/${encodeURIComponent(token)}${path}`), {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    if (!response.ok) {
      const problem = await response.json().catch(() => null);
      throw { status: response.status, code: problem?.code, message: problem?.message, errors: problem?.errors as FieldError[] | undefined };
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

  function describe(e: unknown): string {
    const err = e as { status?: number; message?: string };
    if (err?.status === 429) return t.tooMany;
    return err?.message || t.error;
  }

  async function sendCode(next?: "WHATSAPP" | "EMAIL") {
    if (busy) return;
    setBusy(true); setNotice(null);
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
  function checkLocally(values: Form, agreed: string[], required: string[]): Record<string, string> {
    const e: Record<string, string> = {};
    if (values.givenName.trim().length < 1) e.givenName = t.errGiven;
    if (!values.familyName.trim() && !values.singleLegalName) e.familyName = t.errFamily;
    if (!values.dateOfBirth) e.dateOfBirth = t.errDob;
    else if (values.dateOfBirth > new Date().toISOString().slice(0, 10)) e.dateOfBirth = t.errDobFuture;
    if (!values.sex) e.sex = t.errSelect;
    if (!values.nationality) e.nationality = t.errSelect;
    if (!values.countryOfResidence) e.countryOfResidence = t.errSelect;
    if (!values.mobileOwner) e.mobileOwner = t.errOwner;
    const phone = values.phone.replace(/[^\d+]/g, "");
    if (values.mobileOwner === "PATIENT" && !/^\+[1-9]\d{6,14}$/.test(phone)) e.phone = t.errPhone;
    if (values.mobileOwner === "REPRESENTATIVE" && phone && !/^\+[1-9]\d{6,14}$/.test(phone)) e.phone = t.errPhone;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email.trim())) e.email = t.errEmail;
    if (required.some(type => !agreed.includes(type))) e.consents = t.errConsents;
    return e;
  }

  async function activate(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !form || !grant || !prefill) return;
    const local = checkLocally(form, consents, prefill.requiredConsents);
    if (Object.keys(local).length) { setFieldErrors(local); setNotice(t.fixFields); return; }
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
      const err = e as { errors?: FieldError[]; status?: number };
      if (err?.errors?.length) {
        setFieldErrors(Object.fromEntries(err.errors.map(x => [x.field, x.message])));
        setNotice(t.fixFields);
      } else if (err?.status === 401) {
        // The short-lived grant expired while the form was open: re-verify, keeping everything typed.
        setGrant(null); setCodeSent(false); setStage("verify"); setNotice(t.sessionExpired);
      } else setNotice(describe(e));
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

  const stepIndex = stage === "verify" ? 0 : stage === "form" ? 1 : 2;

  if (stage === "loading") return <Shell locale={locale}><p className="text-ink-500">{t.loading}</p></Shell>;
  if (stage === "invalid") return (
    <Shell locale={locale}>
      <div className="card p-6 md:p-8">
        <h1 className="title" tabIndex={-1} ref={headingRef}>{t.invalid}</h1>
      </div>
    </Shell>
  );

  const repOwned = form?.mobileOwner === "REPRESENTATIVE";
  const relationshipLabel = prefill?.representativeRelationship ? ((t.relationship as Record<string, string>)[prefill.representativeRelationship] ?? prefill.representativeRelationship) : "";
  // The deposit is the patient's to pay in My Care (DEP-3); until it is, it is the next step, never a finished one.
  const depositOwed = !!deposit?.required && !deposit.satisfied;
  const depositLine = !deposit ? null : !deposit.required || deposit.status === "WAIVED" ? t.stepDepositWaived : deposit.satisfied ? t.stepDeposit : null;
  const accountActive = account?.status === "ACTIVE";
  const finished = [t.stepProposal, t.stepProfile, ...(accountActive ? [t.stepAccount] : []), ...(depositLine ? [depositLine] : [])];
  // A return visit once the deposit is in: the coordination is underway. Otherwise the profile is ready, saying only what is.
  const underway = stage === "done" && !depositOwed;
  const ready = underway ? { title: t.doneTitle, intro: t.doneIntro } : { title: t.readyTitle, intro: accountActive ? t.readyIntro : t.readyIntroProfile };
  const amountOwed = depositOwed && deposit ? deposit.balance ?? deposit.amountDue : null;

  return (
    <Shell locale={locale}>
      {stage !== "done" && stage !== "activated" && <Steps labels={t.steps} current={stepIndex} stepOf={t.stepOf} of={t.of} />}

      {notice && stage !== "verify" && (
        <p role="alert" className="mb-5 rounded-xl border border-alert-200 bg-alert-50 p-4 text-sm text-alert-800">{notice}</p>
      )}

      {stage === "verify" && (
        <section className="card p-6 md:p-8">
          <p className="eyebrow">{t.eyebrow}</p>
          <h1 ref={headingRef} tabIndex={-1} className="headline mt-2 outline-none">{t.verifyTitle}</h1>
          <div className="mt-3">
            {/* This endpoint accepts a channel: before a code is sent the other one is offered (and sends there). */}
            <OneTimeCodeStep key={codeRound} error={notice} copy={{ sendTo: t.verifyIntro, sentTo: t.codeSent, send: t.sendCode, sending: t.sending, codeLabel: t.codeLabel, verify: t.verify, verifying: t.verifying, resend: t.resend }}
                             destination={summary?.destinationHint} sent={codeSent} busy={busy}
                             onSend={() => void sendCode()} onVerify={code => void verify(code)}
                             channelSwitch={codeSent ? null : { label: channel === "WHATSAPP" ? t.useEmail : t.useWhatsapp, onSwitch: () => void sendCode(channel === "WHATSAPP" ? "EMAIL" : "WHATSAPP") }}/>
          </div>
        </section>
      )}

      {stage === "form" && form && prefill && (
        <form className="card p-6 md:p-8" onSubmit={activate} noValidate>
          <p className="eyebrow">{t.caseLabel} {prefill.caseNumber}</p>
          <h1 ref={headingRef} tabIndex={-1} className="headline mt-2 outline-none">{t.formTitle}</h1>
          <p className="lead mt-3">{t.formIntro}</p>
          {prefill.submittedBy === "REPRESENTATIVE" && prefill.representativeName && (
            <p className="mt-4 rounded-xl bg-mist p-4 text-sm leading-6 text-ink-700">{fillTemplate(t.submittedByRep, { name: `\u2068${prefill.representativeName}\u2069`, relationship: relationshipLabel })}</p>
          )}

          <Fieldset legend={t.sectionAbout}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t.givenName} required requiredLabel={t.required} error={fieldErrors.givenName} hint={prefill.givenName ? t.prefilledNote : undefined}>
                <input className={`field ${fieldErrors.givenName ? "field-error" : ""}`} autoComplete="given-name"
                       value={form.givenName} onChange={e => setForm({ ...form, givenName: e.target.value })} />
              </Field>
              <Field label={form.singleLegalName ? `${t.familyName} (${t.optional})` : t.familyName} required={!form.singleLegalName} requiredLabel={t.required} error={fieldErrors.familyName} hint={prefill.familyName ? t.prefilledNote : undefined}>
                <input className={`field ${fieldErrors.familyName ? "field-error" : ""}`} autoComplete="family-name"
                       value={form.familyName} onChange={e => setForm({ ...form, familyName: e.target.value })} />
              </Field>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-600"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.singleLegalName} onChange={e => setForm({ ...form, singleLegalName: e.target.checked })} />{t.singleName}</label>
            <p className="text-xs leading-5 text-ink-500">{t.namesHelp}</p>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={`${t.preferredName} (${t.optional})`} error={fieldErrors.preferredName}>
                <input className="field" autoComplete="nickname" value={form.preferredName} onChange={e => setForm({ ...form, preferredName: e.target.value })} />
              </Field>
              <Field label={t.dateOfBirth} required requiredLabel={t.required} error={fieldErrors.dateOfBirth}>
                <input type="date" dir="ltr" className={`field ${fieldErrors.dateOfBirth ? "field-error" : ""}`}
                       max={new Date().toISOString().slice(0, 10)} autoComplete="bday"
                       value={form.dateOfBirth} onChange={e => setForm({ ...form, dateOfBirth: e.target.value })} />
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t.sex} required requiredLabel={t.required} help={t.sexHelp} error={fieldErrors.sex}>
                <select className={`field ${fieldErrors.sex ? "field-error" : ""}`} value={form.sex}
                        onChange={e => setForm({ ...form, sex: e.target.value })}>
                  <option value="">{t.selectOption}</option>
                  <option value="MALE">{t.male}</option>
                  <option value="FEMALE">{t.female}</option>
                  <option value="OTHER">{t.other}</option>
                  <option value="UNDISCLOSED">{t.undisclosed}</option>
                </select>
              </Field>
              <Field label={t.nationality} required requiredLabel={t.required} error={fieldErrors.nationality}>
                <CountrySelect value={form.nationality} placeholder={t.selectCountry} empty={t.noCountry}
                               invalid={!!fieldErrors.nationality} onChange={v => setForm({ ...form, nationality: v })} />
              </Field>
            </div>
            <Field label={t.residence} required requiredLabel={t.required} error={fieldErrors.countryOfResidence} hint={prefill.countryOfResidence ? t.prefilledNote : undefined}>
              <CountrySelect value={form.countryOfResidence} placeholder={t.selectCountry} empty={t.noCountry}
                             invalid={!!fieldErrors.countryOfResidence} onChange={v => setForm({ ...form, countryOfResidence: v })} />
            </Field>
          </Fieldset>

          <Fieldset legend={t.sectionContact}>
            {/* Account email: mandatory, security-sensitive. A known address is offered, never assumed. */}
            <div className="rounded-xl border border-line bg-white p-4">
              <p className="text-sm font-bold text-ink-800">{t.accountEmail} <span className="text-alert-700" aria-hidden>*</span></p>
              <p className="mt-1 text-xs leading-5 text-ink-500">{t.accountEmailHelp}</p>
              {prefill.candidateEmail && (
                <div className="mt-3 rounded-lg bg-brand-50 p-3">
                  <p className="text-sm text-ink-700"><span dir="ltr" className="font-semibold text-ink-900">{maskEmail(prefill.candidateEmail)}</span>{prefill.emailVerified && <span className="ms-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-800">{t.emailVerifiedNote}</span>}</p>
                  <p className="mt-1 text-xs text-ink-500">{t.haveEmail}</p>
                  <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={t.accountEmail}>
                    <label className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-semibold ${form.emailChoice === "candidate" ? "border-brand-600 bg-white text-brand-800" : "border-line bg-white text-ink-600"}`}>
                      <input type="radio" name="emailChoice" className="sr-only" checked={form.emailChoice === "candidate"} onChange={() => setForm({ ...form, emailChoice: "candidate", email: prefill.candidateEmail ?? "" })} />{t.useThisEmail}
                    </label>
                    <label className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-semibold ${form.emailChoice === "other" ? "border-brand-600 bg-white text-brand-800" : "border-line bg-white text-ink-600"}`}>
                      <input type="radio" name="emailChoice" className="sr-only" checked={form.emailChoice === "other"} onChange={() => setForm({ ...form, emailChoice: "other", email: "" })} />{t.useAnotherEmail}
                    </label>
                  </div>
                </div>
              )}
              {(!prefill.candidateEmail || form.emailChoice === "other") && (
                <div className="mt-3">
                  <Field label={t.emailOther} required requiredLabel={t.required} error={fieldErrors.email}>
                    <input className={`field ${fieldErrors.email ? "field-error" : ""}`} type="email" dir="ltr" inputMode="email"
                           autoComplete="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                  </Field>
                </div>
              )}
              {prefill.candidateEmail && form.emailChoice === "candidate" && fieldErrors.email && <p className="error-text mt-2">{fieldErrors.email}</p>}
            </div>

            {/* Mobile: shown as known, ownership made explicit; never promoted to the patient by default. */}
            <div className="rounded-xl border border-line bg-white p-4">
              <p className="text-sm font-bold text-ink-800">{t.phone}</p>
              {prefill.knownMobile && (
                <>
                  <p className="mt-1 text-sm text-ink-700"><span dir="ltr" className="font-semibold text-ink-900">{prefill.knownMobile}</span> <span className="text-xs text-ink-500">· {t.prefilledNote}</span></p>
                  <p className="mt-3 text-sm font-semibold text-ink-800">{t.belongsTo}</p>
                  <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={t.belongsTo}>
                    {([["PATIENT", t.ownerMe], ["REPRESENTATIVE", t.ownerRep]] as const).map(([key, label]) => (
                      <label key={key} className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-semibold ${form.mobileOwner === key ? "border-brand-600 bg-brand-50 text-brand-800" : "border-line bg-white text-ink-600"}`}>
                        <input type="radio" name="mobileOwner" className="sr-only" checked={form.mobileOwner === key}
                               onChange={() => setForm({ ...form, mobileOwner: key, phone: key === "PATIENT" ? (prefill.knownMobile ?? "") : "" })} />{label}
                      </label>
                    ))}
                  </div>
                  {fieldErrors.mobileOwner && <p className="error-text mt-2">{fieldErrors.mobileOwner}</p>}
                  {repOwned && <p className="mt-2 text-xs leading-5 text-ink-500">{fillTemplate(t.ownerRepKnown, { number: `\u2066${prefill.knownMobile}\u2069` })} {t.ownerRepHelp}</p>}
                </>
              )}
              {(!prefill.knownMobile || repOwned) && (
                <div className="mt-3">
                  <Field label={repOwned ? `${t.yourOwnPhone} (${t.phoneOptional})` : t.phone} required={!repOwned} requiredLabel={t.required} help={t.phoneHelp} error={fieldErrors.phone}>
                    <input className={`field ${fieldErrors.phone ? "field-error" : ""}`} dir="ltr" inputMode="tel" autoComplete="tel"
                           value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value, mobileOwner: form.mobileOwner || "PATIENT" })} />
                  </Field>
                </div>
              )}
              {prefill.knownMobile && form.mobileOwner === "PATIENT" && fieldErrors.phone && <p className="error-text mt-2">{fieldErrors.phone}</p>}
            </div>

            <Field label={t.language} error={fieldErrors.preferredLanguage}>
              <select className="field" value={form.preferredLanguage}
                      onChange={e => setForm({ ...form, preferredLanguage: e.target.value })}>
                <option value="en">{t.english}</option>
                <option value="ar">{t.arabic}</option>
              </select>
            </Field>
          </Fieldset>

          <Fieldset legend={t.sectionAgreements}>
            {fieldErrors.consents && <p className="error-text mb-2">{fieldErrors.consents}</p>}
            <ul className="space-y-3">
              {prefill.requiredConsents.map(type => {
                const checked = consents.includes(type);
                // The patient accepts deposit terms only with those terms in front of them, on this page.
                const depositTermsConsent = type === "DEPOSIT_CANCELLATION_TERMS";
                const dep = prefill.deposit;
                return (
                  <li key={type}>
                    {depositTermsConsent && (
                      <div className="mb-2">
                        <CoordinationDepositTerms id="activation-deposit-terms" locale={locale} level={3}
                          amount={dep.required && dep.amountDue != null ? money(dep.amountDue, dep.currency, locale) : null}
                          currency={dep.required ? dep.currency : null} />
                      </div>
                    )}
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-brand-50/50 p-4">
                      <input type="checkbox" className="mt-1 h-5 w-5 flex-none accent-brand-600" checked={checked}
                             aria-describedby={depositTermsConsent ? "activation-deposit-terms" : undefined}
                             onChange={e => setConsents(v => e.target.checked ? [...v, type] : v.filter(x => x !== type))} />
                      <span className="text-sm leading-6 text-ink-700">{type === "DEPOSIT_CANCELLATION_TERMS" ? DEPOSIT_CONSENT[locale] : (t.consents as Record<string, string>)[type] ?? type}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 rounded-xl bg-mist p-4 text-sm leading-6 text-ink-600">{t.passportNote}</p>
          </Fieldset>

          <button className="btn-primary mt-8 w-full sm:w-auto" disabled={busy}>{busy ? t.activating : t.activate}</button>
        </form>
      )}

      {/* Account setup: the password is created inside the identity provider from a link in the inbox. */}
      {stage === "account" && (
        <section className="card p-6 md:p-8">
          <p className="eyebrow">{t.caseLabel} {prefill?.caseNumber}</p>
          <h1 ref={headingRef} tabIndex={-1} className="headline mt-2 outline-none">{t.accountTitle}</h1>
          <p className="lead mt-3">{t.accountIntro}</p>
          <div className="mt-6 rounded-xl border border-brand-200 bg-brand-50 p-5">
            <p className="text-ink-800">{account?.emailSent === false ? t.accountNotSent : t.accountSent} <strong dir="ltr" className="text-ink-900">{account?.emailHint ?? "***"}</strong></p>
            <p className="mt-2 text-sm leading-6 text-ink-600">{t.accountSentHelp}</p>
          </div>
          {resent && <p role="status" className="mt-4 text-sm font-semibold text-brand-800">{t.accountResent}</p>}
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => void resendSetup()}>{busy ? t.resending : t.accountResend}</button>
          </div>
        </section>
      )}

      {/* Profile + account complete: what is finished, in true steps only, then the one thing still owed or the way in. */}
      {(stage === "activated" || stage === "done") && (
        <section className="card p-6 md:p-8">
          <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-white"><Check size={22} strokeWidth={2.5}/></span>
          <h1 ref={headingRef} tabIndex={-1} className="headline mt-5 outline-none">{ready.title}</h1>
          <p className="lead mt-3">{ready.intro}</p>
          <ul className="mt-7 space-y-3">
            {finished.map(step => (
              <li key={step} className="flex items-center gap-3 text-ink-800">
                <span aria-hidden className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-100 text-brand-700"><Check size={14} strokeWidth={3}/></span>
                {step}
              </li>
            ))}
          </ul>

          {depositOwed ? (
            <div className="mt-7 border-t border-line pt-5">
              <p className="label-micro text-brand-700">{t.nextStepLabel}</p>
              <h2 className="mt-1.5 font-semibold text-ink-900">{t.nextPay}</h2>
              {amountOwed != null && deposit && (
                <p className="mt-1 text-ink-800">{t.amountDue}: <bdi dir="ltr" className="font-semibold tabular-nums">{money(amountOwed, deposit.currency, locale)}</bdi></p>
              )}
              <p className="mt-1 max-w-[65ch] text-[0.9375rem] leading-6 text-ink-600">{t.nextPayHow}</p>
              <button type="button" className="btn-primary mt-5 w-full sm:w-auto" disabled={busy} aria-busy={busy || undefined} onClick={() => void openPortal()}>
                {busy ? t.opening : t.signInToPay}
              </button>
            </div>
          ) : (<>
            {underway && <p className="mt-7 leading-7 text-ink-600">{t.portalIntro}</p>}
            {/* It opens sign-in on this case, so it says so. */}
            <button type="button" className="btn-primary mt-6 w-full sm:w-auto" disabled={busy} aria-busy={busy || undefined} onClick={() => void openPortal()}>
              {busy ? t.opening : t.viewJourney}
            </button>
          </>)}
        </section>
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

function Shell({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return (
    <section className="section section-soft">
      <div className="container-site" style={{ maxWidth: "44rem" }} lang={locale}>{children}</div>
    </section>
  );
}

function Steps({ labels, current, stepOf, of }: { labels: string[]; current: number; stepOf: string; of: string }) {
  return (
    <nav className="mb-6" aria-label={`${stepOf} ${current + 1} ${of} ${labels.length}`}>
      <ol className="flex items-center gap-2">
        {labels.map((label, index) => {
          const done = index < current, active = index === current;
          return (
            <li key={label} className="flex min-w-0 flex-1 items-center gap-2">
              <span aria-hidden
                    className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-bold ${
                      done ? "bg-brand-600 text-white" : active ? "border-2 border-brand-600 text-brand-700" : "border border-line-strong text-ink-400"}`}>
                {done ? "✓" : index + 1}
              </span>
              <span className={`truncate text-sm ${active ? "font-bold text-ink-900" : "text-ink-500"}`}>{label}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="mt-8 min-w-0 border-0 p-0">
      <legend className="text-sm font-bold uppercase tracking-wide text-accent-700">{legend}</legend>
      <div className="mt-4 space-y-5">{children}</div>
    </fieldset>
  );
}

function Field({ label, required, requiredLabel, help, hint, error, children }: {
  label: string; required?: boolean; requiredLabel?: string; help?: string; hint?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex flex-wrap items-center gap-2 text-sm font-bold text-ink-800">
        {label}
        {required && <span className="text-alert-700"><span aria-hidden>*</span><span className="sr-only"> {requiredLabel}</span></span>}
        {hint && <span className="text-xs font-normal text-ink-400">· {hint}</span>}
      </span>
      {children}
      {error ? <span className="error-text mt-2 block">{error}</span>
             : help ? <span className="mt-2 block text-xs leading-5 text-ink-500">{help}</span> : null}
    </label>
  );
}

function CountrySelect({ value, placeholder, empty, invalid, onChange }: {
  value: string; placeholder: string; empty: string; invalid?: boolean; onChange: (iso2: string) => void;
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

  return (
    <div ref={root} className="relative">
      <input
        role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" autoComplete="off"
        className={`field ${invalid ? "field-error" : ""}`}
        placeholder={placeholder}
        value={open ? query : selected ? `${flagEmoji(selected.iso2)} ${selected.name}` : ""}
        onFocus={() => { setOpen(true); setActive(0); }}
        onChange={e => { setQuery(e.target.value); setActive(0); if (!open) setOpen(true); }}
        onKeyDown={e => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, results.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && open && results[active]) { e.preventDefault(); choose(results[active].iso2); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-line bg-white py-1 shadow-lg">
          {results.length === 0 ? <li className="px-4 py-3 text-sm text-ink-500">{empty}</li> : results.map((c, i) => (
            <li key={c.iso2} role="option" aria-selected={c.iso2 === value}
                className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm ${i === active ? "bg-brand-50" : ""}`}
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
