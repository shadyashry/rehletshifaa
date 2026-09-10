"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { COUNTRIES, flagEmoji } from "@/lib/countries";
import type { Locale } from "@/lib/i18n";

type Summary = { caseNumber: string; purpose: string; channel: string; destinationHint: string };
type Deposit = {
  required: boolean; status: string; currency: string;
  amountDue: number | null; amountPaid: number | null; balance: number | null; satisfied: boolean;
};
type Prefill = {
  caseNumber: string; caseStatus: string; onboardingState: string | null; profileActive: boolean; accountLinked: boolean;
  fullName: string | null; email: string | null; phone: string | null; dateOfBirth: string | null;
  nationality: string | null; countryOfResidence: string | null; preferredLanguage: string | null; sex: string | null;
  emailVerified: boolean; phoneVerified: boolean;
  requiredConsents: string[]; completedConsents: string[]; deposit: Deposit;
  currentAction?: PatientAction; journeyStage?: JourneyStage; waitingOn?: string | null;
};
type FieldError = { field: string; message: string };
type Form = {
  fullName: string; email: string; phone: string; dateOfBirth: string;
  nationality: string; countryOfResidence: string; preferredLanguage: string; sex: string;
};

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

const copy = {
  en: {
    eyebrow: "Continue your care",
    verifyTitle: "Let's confirm it's you",
    verifyIntro: "For your security we'll send a 6-digit code to",
    sendCode: "Send code", sending: "Sending…", resend: "Send a new code",
    codeLabel: "6-digit code", verify: "Continue", verifying: "Checking…",
    useEmail: "Send to email instead", useWhatsapp: "Send to WhatsApp instead",
    formTitle: "Complete your profile",
    formIntro: "We've already filled in the information you gave us when you created your case. Please check it and add what's missing.",
    prefilledNote: "Pre-filled from your case",
    sectionAbout: "About the patient", sectionContact: "How we reach you", sectionAgreements: "Agreements",
    fullName: "Full name", fullNameHelp: "As it appears on official documents.",
    dateOfBirth: "Date of birth", sex: "Sex", sexHelp: "Recorded for medical care.",
    nationality: "Nationality", residence: "Country of residence",
    phone: "WhatsApp number", email: "Email", emailOptional: "optional", language: "Preferred language",
    required: "Required",
    selectCountry: "Search country…", noCountry: "No matching country", selectOption: "Select…",
    male: "Male", female: "Female", other: "Other", undisclosed: "Prefer not to say",
    english: "English", arabic: "العربية",
    activate: "Complete my profile", activating: "Saving…",
    passportNote: "We don't need your passport or ID now. If your treatment needs a visa or travel booking, your coordinator will ask for it later.",
    amountDue: "Amount due", alreadyPaid: "Already received", balance: "Remaining",
    depositPending: "You can safely close this page — nothing is lost, and your case continues automatically once the deposit is recorded.",
    refreshStatus: "Refresh status",
    readyTitle: "Your profile is ready",
    readyIntro: "Your patient profile is active. You can use your account to follow this case and any other case linked to your profile.",
    nextStepLabel: "Next step",
    nextDeposit: "Deposit for your accepted care estimate",
    viewDeposit: "View deposit details",
    nextDepositWho: "Your coordinator will arrange this with you.",
    depositStageTitle: "Deposit arrangements",
    depositArrangements: "Your coordinator will provide or arrange the payment instructions for your region and record the payment once it arrives.",
    noActionNeeded: "No action is required from you right now.",
    backToCase: "Go to my case",
    doneTitle: "Your treatment journey is now active",
    doneIntro: "Your RehletShifaa coordinator is starting the next stage of your treatment coordination and will contact you shortly.",
    stepProposal: "Proposal accepted", stepProfile: "Profile activated", stepDeposit: "Deposit received",
    portalTitle: "Your secure portal",
    portalIntro: "Your profile is active. Continue to your secure portal to follow this case — and every other case you have with us — in one place.",
    portalSignIn: "You'll set up or confirm your sign-in once. After that you sign in normally.",
    viewJourney: "View my journey", opening: "Opening…",
    caseLabel: "Case",
    stepOf: "Step", of: "of",
    steps: ["Verify", "Your details"],
    invalid: "This link is invalid or has expired. Please ask your coordinator for a new one.",
    error: "Something went wrong. Please try again.",
    tooMany: "Too many attempts. Please try again in a little while.",
    fixFields: "Please check the highlighted fields.",
    sessionExpired: "Your secure session timed out. Please confirm the code again — nothing you entered was lost.",
    errName: "Enter the full name.", errDob: "Enter the date of birth.", errDobFuture: "The date of birth cannot be in the future.",
    errSelect: "Please choose an option.", errPhone: "Enter a valid international number, for example +971 50 123 4567.",
    errEmail: "Enter a valid email address.", errConsents: "Please accept all required agreements to continue.",
    loading: "Loading…",
  },
  ar: {
    eyebrow: "تابع رحلتك العلاجية",
    verifyTitle: "لنتأكد أنه أنت",
    verifyIntro: "لحمايتك سنرسل رمزًا من 6 أرقام إلى",
    sendCode: "إرسال الرمز", sending: "جارٍ الإرسال…", resend: "إرسال رمز جديد",
    codeLabel: "الرمز المكوّن من 6 أرقام", verify: "متابعة", verifying: "جارٍ التحقق…",
    useEmail: "أرسله إلى البريد بدلًا من ذلك", useWhatsapp: "أرسله إلى واتساب بدلًا من ذلك",
    formTitle: "أكمل ملفك الشخصي",
    formIntro: "أدخلنا مسبقًا المعلومات التي زوّدتنا بها عند إنشاء حالتك. يرجى مراجعتها وإكمال الناقص.",
    prefilledNote: "معبأ مسبقًا من حالتك",
    sectionAbout: "بيانات المريض", sectionContact: "وسيلة التواصل", sectionAgreements: "الموافقات",
    fullName: "الاسم الكامل", fullNameHelp: "كما يظهر في المستندات الرسمية.",
    dateOfBirth: "تاريخ الميلاد", sex: "الجنس", sexHelp: "يُسجَّل لأغراض الرعاية الطبية.",
    nationality: "الجنسية", residence: "بلد الإقامة",
    phone: "رقم واتساب", email: "البريد الإلكتروني", emailOptional: "اختياري", language: "لغة التواصل",
    required: "مطلوب",
    selectCountry: "ابحث عن الدولة…", noCountry: "لا توجد نتائج", selectOption: "اختر…",
    male: "ذكر", female: "أنثى", other: "أخرى", undisclosed: "أفضّل عدم الإفصاح",
    english: "English", arabic: "العربية",
    activate: "استكمال ملفي", activating: "جارٍ الحفظ…",
    passportNote: "لا نحتاج جواز سفرك أو هويتك الآن. إذا احتاج علاجك تأشيرة أو حجز سفر، سيطلبها منسقك لاحقًا.",
    amountDue: "المبلغ المستحق", alreadyPaid: "المستلم بالفعل", balance: "المتبقي",
    depositPending: "يمكنك إغلاق هذه الصفحة بأمان — لن يضيع شيء، وتستكمل حالتك تلقائيًا فور تسجيل الوديعة.",
    refreshStatus: "تحديث الحالة",
    readyTitle: "ملفك جاهز",
    readyIntro: "ملفك الطبي مُفعّل الآن. يمكنك استخدام حسابك لمتابعة هذه الحالة وأي حالة أخرى مرتبطة بملفك.",
    nextStepLabel: "الخطوة التالية",
    nextDeposit: "وديعة تقدير الرعاية الذي قبلته",
    viewDeposit: "عرض تفاصيل الوديعة",
    nextDepositWho: "سيرتّب منسّقك ذلك معك.",
    depositStageTitle: "ترتيبات الوديعة",
    depositArrangements: "سيوفّر منسّقك تعليمات الدفع الخاصة بمنطقتك أو يرتّبها، ويسجّل الدفعة فور وصولها.",
    noActionNeeded: "لا يلزمك أي إجراء الآن.",
    backToCase: "الذهاب إلى حالتي",
    doneTitle: "رحلتك العلاجية نشطة الآن",
    doneIntro: "بدأ منسق رحلة شفاء المرحلة التالية من تنسيق علاجك وسيتواصل معك قريبًا.",
    stepProposal: "تم قبول العرض", stepProfile: "تم تفعيل الملف", stepDeposit: "تم استلام الوديعة",
    portalTitle: "بوابتك الآمنة",
    portalIntro: "ملفك مُفعَّل الآن. تابع إلى بوابتك الآمنة لمتابعة هذه الحالة — وكل حالاتك معنا — في مكان واحد.",
    portalSignIn: "ستجهّز أو تؤكد بيانات الدخول مرة واحدة فقط، ثم تسجّل الدخول بشكل طبيعي بعد ذلك.",
    viewJourney: "عرض رحلتي", opening: "جارٍ الفتح…",
    caseLabel: "الحالة",
    stepOf: "الخطوة", of: "من",
    steps: ["التحقق", "بياناتك"],
    invalid: "هذا الرابط غير صالح أو انتهت صلاحيته. يرجى طلب رابط جديد من منسقك.",
    error: "حدث خطأ ما. يرجى المحاولة مرة أخرى.",
    tooMany: "محاولات كثيرة. يرجى المحاولة بعد قليل.",
    fixFields: "يرجى مراجعة الحقول المحددة.",
    sessionExpired: "انتهت جلستك الآمنة. يرجى تأكيد الرمز مرة أخرى — لم يضِع ما أدخلته.",
    errName: "أدخل الاسم الكامل.", errDob: "أدخل تاريخ الميلاد.", errDobFuture: "لا يمكن أن يكون تاريخ الميلاد في المستقبل.",
    errSelect: "يرجى اختيار أحد الخيارات.", errPhone: "أدخل رقمًا دوليًا صحيحًا، مثال ‎+971 50 123 4567.",
    errEmail: "أدخل بريدًا إلكترونيًا صحيحًا.", errConsents: "يرجى قبول جميع الموافقات المطلوبة للمتابعة.",
    loading: "جارٍ التحميل…",
  },
};

const CONSENT_TEXT: Record<string, { en: string; ar: string }> = {
  PRIVACY_DATA_PROCESSING: {
    en: "I agree that RehletShifaa may process my personal and health information to coordinate my care.",
    ar: "أوافق على أن تعالج رحلة شفاء بياناتي الشخصية والصحية لتنسيق رعايتي.",
  },
  CROSS_BORDER_CARE: {
    en: "I agree that my information may be shared across borders with the treating providers.",
    ar: "أوافق على مشاركة معلوماتي عبر الحدود مع مقدمي الرعاية المعالجين.",
  },
  DEPOSIT_CANCELLATION_TERMS: {
    en: "I have read and accept the coordination deposit, cancellation and refund terms.",
    ar: "قرأت وأقبل شروط وديعة التنسيق والإلغاء والاسترداد.",
  },
  MEDICAL_INFORMATION_SHARING: {
    en: "I agree that my medical information may be shared with the treating consultants.",
    ar: "أوافق على مشاركة معلوماتي الطبية مع الاستشاريين المعالجين.",
  },
  TELECONSULTATION: {
    en: "I agree to remote consultation where it is clinically appropriate.",
    ar: "أوافق على الاستشارة عن بُعد عندما يكون ذلك مناسبًا سريريًا.",
  },
  REPRESENTATIVE_AUTHORIZATION: {
    en: "I confirm I am authorized to act for the patient in coordinating this care.",
    ar: "أؤكد أنني مفوّض للتصرف نيابة عن المريض في تنسيق هذه الرعاية.",
  },
};

type PatientAction = "COMPLETE_PROFILE" | "NONE" | "CONTINUE_IN_PORTAL";
type JourneyStage = "PROFILE" | "DEPOSIT" | "CARE_COORDINATION";
/** "activated" is the moment the profile becomes ready — deliberately its own screen, before any money. */
type Stage = "loading" | "verify" | "form" | "activated" | "deposit" | "done" | "invalid";

/**
   * Fall back to the profile step whenever the server has not named an action: stranding someone on a
   * payment screen is the one wrong answer here, and an incomplete profile is the safe assumption.
   */
function resolveAction(data: { currentAction?: PatientAction; profileActive: boolean; deposit: Deposit }): PatientAction {
  if (data.currentAction) return data.currentAction;
  if (!data.profileActive) return "COMPLETE_PROFILE";
  return data.deposit.satisfied ? "CONTINUE_IN_PORTAL" : "NONE";
}

/** Resume exactly where the server says the patient stands, so a reload never reopens a finished step. */
function stageFor(action: PatientAction): Stage {
  if (action === "COMPLETE_PROFILE") return "form";
  if (action === "CONTINUE_IN_PORTAL") return "done";
  return "deposit"; // nothing for the patient to do, but the deposit stage is what they should see
}

export function ProfileActivation({ locale, token }: { locale: Locale; token: string }) {
  const t = copy[locale];

  const [stage, setStage] = useState<Stage>("loading");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [channel, setChannel] = useState<"WHATSAPP" | "EMAIL">("WHATSAPP");
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [grant, setGrant] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [deposit, setDeposit] = useState<Deposit | null>(null);
  const [action, setAction] = useState<PatientAction | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [consents, setConsents] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the new step heading so keyboard and screen-reader users follow the flow.
  useEffect(() => { if (stage !== "loading") headingRef.current?.focus(); }, [stage]);

  const call = useCallback(async (path: string, body?: unknown) => {
    const response = await fetch(`${API}/api/v1/public/onboarding/${encodeURIComponent(token)}${path}`, {
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
      setSummary(data); setChannel(chosen); setCodeSent(true); setCode("");
    } catch (e) { setNotice(describe(e)); } finally { setBusy(false); }
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (busy || code.length !== 6) return;
    setBusy(true); setNotice(null);
    try {
      const granted: { grant: string } = await call("/verify", { code });
      const data: Prefill = await call("/profile", { grant: granted.grant });
      setGrant(granted.grant);
      setPrefill(data);
      setDeposit(data.deposit);
      // Keep anything already typed: re-verifying after a timeout must never discard the patient's work.
      setForm(previous => previous ?? {
        fullName: data.fullName ?? "",
        email: data.email ?? "",
        phone: data.phone ?? "",
        dateOfBirth: data.dateOfBirth ?? "",
        nationality: data.nationality ?? "",
        countryOfResidence: data.countryOfResidence ?? "",
        preferredLanguage: data.preferredLanguage ?? locale,
        sex: data.sex ?? "",
      });
      setConsents(previous => previous.length ? previous : data.completedConsents.filter(c => data.requiredConsents.includes(c)));
      const resolved = resolveAction(data);
      setAction(resolved);
      setStage(stageFor(resolved));
    } catch (e) { setNotice(describe(e)); } finally { setBusy(false); }
  }

  /**
   * A first pass so obvious mistakes are caught without a round-trip. The backend re-validates everything
   * and remains authoritative; this only mirrors its rules for a faster, calmer correction loop.
   */
  function checkLocally(values: Form, agreed: string[], required: string[]): Record<string, string> {
    const e: Record<string, string> = {};
    const name = values.fullName.trim();
    if (name.length < 2) e.fullName = t.errName;
    if (!values.dateOfBirth) e.dateOfBirth = t.errDob;
    else if (values.dateOfBirth > new Date().toISOString().slice(0, 10)) e.dateOfBirth = t.errDobFuture;
    if (!values.sex) e.sex = t.errSelect;
    if (!values.nationality) e.nationality = t.errSelect;
    if (!values.countryOfResidence) e.countryOfResidence = t.errSelect;
    if (!/^\+[1-9]\d{6,14}$/.test(values.phone.replace(/[^\d+]/g, ""))) e.phone = t.errPhone;
    if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email.trim())) e.email = t.errEmail;
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
      const result: { profileActive: boolean; deposit: Deposit; currentAction?: PatientAction } =
        await call("/activate", { grant, profile: { ...form, consents } });
      setDeposit(result.deposit);
      setAction(resolveAction(result));
      setStage("activated");
    } catch (e) {
      const err = e as { errors?: FieldError[]; status?: number };
      if (err?.errors?.length) {
        setFieldErrors(Object.fromEntries(err.errors.map(x => [x.field, x.message])));
        setNotice(t.fixFields);
      } else if (err?.status === 401) {
        // The short-lived grant expired while the form was open: re-verify, keeping everything typed.
        setGrant(null); setCodeSent(false); setCode(""); setStage("verify"); setNotice(t.sessionExpired);
      } else setNotice(describe(e));
    } finally { setBusy(false); }
  }

  const refreshDeposit = useCallback(async () => {
    if (!grant) return;
    try {
      const data: Deposit = await call("/deposit", { grant });
      setDeposit(data);
      if (data.satisfied) { setAction("CONTINUE_IN_PORTAL"); setStage("done"); }
    } catch { /* keep the current view; the patient can retry */ }
  }, [call, grant]);

  /**
   * Continue into the normal authenticated portal. The backend hands over a single-use binding credential
   * only after the profile is active; the portal consumes it once Keycloak has authenticated the patient.
   * That binding — not this case-scoped link — is what makes every other authorized case visible.
   */
  async function openPortal() {
    if (busy || !grant) return;
    setBusy(true); setNotice(null);
    try {
      const handoff: { activationToken: string | null } = await call("/portal-access", { grant });
      const portal = `/${locale}/portal`;
      window.location.assign(handoff.activationToken ? `${portal}?activate=${encodeURIComponent(handoff.activationToken)}` : portal);
    } catch (e) { setNotice(describe(e)); setBusy(false); }
  }

  const stepIndex = stage === "verify" ? 0 : stage === "form" ? 1 : stage === "deposit" ? 2 : 2;

  if (stage === "loading") return <Shell locale={locale}><p className="text-ink-500">{t.loading}</p></Shell>;
  if (stage === "invalid") return (
    <Shell locale={locale}>
      <div className="card p-6 md:p-8">
        <h1 className="title" tabIndex={-1} ref={headingRef}>{t.invalid}</h1>
      </div>
    </Shell>
  );

  return (
    <Shell locale={locale}>
      {stage !== "done" && <Steps labels={t.steps} current={stepIndex} stepOf={t.stepOf} of={t.of} />}

      {notice && (
        <p role="alert" className="mb-5 rounded-xl border border-alert-200 bg-alert-50 p-4 text-sm text-alert-800">{notice}</p>
      )}

      {stage === "verify" && (
        <section className="card p-6 md:p-8">
          <p className="eyebrow">{t.eyebrow}</p>
          <h1 ref={headingRef} tabIndex={-1} className="headline mt-2 outline-none">{t.verifyTitle}</h1>
          <p className="lead mt-3">
            {t.verifyIntro} <strong className="text-ink-900" dir="ltr">{summary?.destinationHint}</strong>
          </p>
          {!codeSent ? (
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button type="button" className="btn-primary w-full sm:w-auto" disabled={busy} onClick={() => void sendCode()}>
                {busy ? t.sending : t.sendCode}
              </button>
              <button type="button" className="link-cta self-start text-sm" disabled={busy}
                      onClick={() => void sendCode(channel === "WHATSAPP" ? "EMAIL" : "WHATSAPP")}>
                {channel === "WHATSAPP" ? t.useEmail : t.useWhatsapp}
              </button>
            </div>
          ) : (
            <form className="mt-7" onSubmit={verify} noValidate>
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-ink-800">{t.codeLabel}</span>
                <input
                  className="field max-w-[16rem] text-center text-2xl tracking-[0.5em]" dir="ltr"
                  inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
                  value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </label>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                <button className="btn-primary w-full sm:w-auto" disabled={busy || code.length !== 6}>
                  {busy ? t.verifying : t.verify}
                </button>
                <button type="button" className="link-cta self-start text-sm" disabled={busy} onClick={() => void sendCode()}>{t.resend}</button>
              </div>
            </form>
          )}
        </section>
      )}

      {stage === "form" && form && prefill && (
        <form className="card p-6 md:p-8" onSubmit={activate} noValidate>
          <p className="eyebrow">{t.caseLabel} {prefill.caseNumber}</p>
          <h1 ref={headingRef} tabIndex={-1} className="headline mt-2 outline-none">{t.formTitle}</h1>
          <p className="lead mt-3">{t.formIntro}</p>

          <Fieldset legend={t.sectionAbout}>
            <Field label={t.fullName} required requiredLabel={t.required} help={t.fullNameHelp} error={fieldErrors.fullName}>
              <input className={`field ${fieldErrors.fullName ? "field-error" : ""}`} autoComplete="name"
                     value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t.dateOfBirth} required requiredLabel={t.required} error={fieldErrors.dateOfBirth}>
                <input type="date" dir="ltr" className={`field ${fieldErrors.dateOfBirth ? "field-error" : ""}`}
                       max={new Date().toISOString().slice(0, 10)} autoComplete="bday"
                       value={form.dateOfBirth} onChange={e => setForm({ ...form, dateOfBirth: e.target.value })} />
              </Field>
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
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t.nationality} required requiredLabel={t.required} error={fieldErrors.nationality}>
                <CountrySelect value={form.nationality} placeholder={t.selectCountry} empty={t.noCountry}
                               invalid={!!fieldErrors.nationality} onChange={v => setForm({ ...form, nationality: v })} />
              </Field>
              <Field label={t.residence} required requiredLabel={t.required} error={fieldErrors.countryOfResidence}>
                <CountrySelect value={form.countryOfResidence} placeholder={t.selectCountry} empty={t.noCountry}
                               invalid={!!fieldErrors.countryOfResidence} onChange={v => setForm({ ...form, countryOfResidence: v })} />
              </Field>
            </div>
          </Fieldset>

          <Fieldset legend={t.sectionContact}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t.phone} required requiredLabel={t.required} error={fieldErrors.phone}
                     hint={prefill.phone ? t.prefilledNote : undefined}>
                <input className={`field ${fieldErrors.phone ? "field-error" : ""}`} dir="ltr" inputMode="tel" autoComplete="tel"
                       value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </Field>
              <Field label={`${t.email} (${t.emailOptional})`} error={fieldErrors.email}
                     hint={prefill.email ? t.prefilledNote : undefined}>
                <input className={`field ${fieldErrors.email ? "field-error" : ""}`} type="email" dir="ltr" inputMode="email"
                       autoComplete="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </Field>
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
                return (
                  <li key={type}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-brand-50/50 p-4">
                      <input type="checkbox" className="mt-1 h-5 w-5 flex-none accent-brand-600" checked={checked}
                             onChange={e => setConsents(v => e.target.checked ? [...v, type] : v.filter(x => x !== type))} />
                      <span className="text-sm leading-6 text-ink-700">{CONSENT_TEXT[type]?.[locale] ?? type}</span>
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

      {/* Profile completion has its own finish line. Money is named as the next task, never as part of it. */}
      {stage === "activated" && (
        <section className="card p-6 md:p-8">
          <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-xl text-white">✓</span>
          <h1 ref={headingRef} tabIndex={-1} className="headline mt-5 outline-none">{t.readyTitle}</h1>
          <p className="lead mt-3">{t.readyIntro}</p>

          {action === "CONTINUE_IN_PORTAL" || !deposit?.required ? (
            <button type="button" className="btn-primary mt-7 w-full sm:w-auto" disabled={busy} onClick={() => void openPortal()}>
              {busy ? t.opening : t.backToCase}
            </button>
          ) : (
            <>
              <div className="mt-7 border-t border-line pt-5">
                <p className="text-[0.72rem] font-bold uppercase tracking-[0.1em] text-brand-700">{t.nextStepLabel}</p>
                <p className="mt-1.5 font-semibold text-ink-900">{t.nextDeposit}</p>
                <p className="mt-1 text-[0.88rem] leading-6 text-ink-600">{t.nextDepositWho}</p>
              </div>
              <button type="button" className="mt-5 text-[0.9rem] font-semibold text-brand-800 underline underline-offset-4"
                      onClick={() => setStage("deposit")}>
                {t.viewDeposit}
              </button>
            </>
          )}
        </section>
      )}

      {/* A status, not a task. Staff arrange the offline deposit, so this screen offers the patient no
          action to take and no button that pretends otherwise — only a quiet way back to their case. */}
      {stage === "deposit" && deposit && (
        <section className="card p-6 md:p-8">
          <p className="eyebrow">{t.caseLabel} {prefill?.caseNumber}</p>
          <h1 ref={headingRef} tabIndex={-1} className="headline mt-2 outline-none">{t.depositStageTitle}</h1>
          <p className="lead mt-3">{t.depositArrangements}</p>

          <dl className="mt-7 overflow-hidden rounded-xl border border-line">
            <Row label={t.amountDue} value={money(deposit.amountDue, deposit.currency, locale)} strong />
            {(deposit.amountPaid ?? 0) > 0 && <Row label={t.alreadyPaid} value={money(deposit.amountPaid, deposit.currency, locale)} />}
            {(deposit.balance ?? 0) > 0 && (deposit.amountPaid ?? 0) > 0 && (
              <Row label={t.balance} value={money(deposit.balance, deposit.currency, locale)} />
            )}
          </dl>

          <p className="mt-6 rounded-xl bg-mist p-4 text-[0.92rem] font-semibold leading-6 text-ink-700" role="status">
            {t.noActionNeeded}
          </p>
          <p className="mt-3 text-sm leading-6 text-ink-500">{t.depositPending}</p>

          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line pt-6">
            <button type="button" className="text-[0.9rem] font-semibold text-brand-800 underline underline-offset-4 disabled:opacity-50"
                    disabled={busy} onClick={() => void openPortal()}>
              {busy ? t.opening : t.backToCase}
            </button>
            <button type="button" className="text-[0.88rem] font-semibold text-ink-500 underline underline-offset-4 disabled:opacity-50"
                    disabled={busy} onClick={() => void refreshDeposit()}>{t.refreshStatus}</button>
          </div>
        </section>
      )}

      {stage === "done" && (
        <section className="card p-6 md:p-8">
          <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-2xl text-white">✓</span>
          <h1 ref={headingRef} tabIndex={-1} className="headline mt-5 outline-none">{t.doneTitle}</h1>
          <p className="lead mt-3">{t.doneIntro}</p>
          <ul className="mt-7 space-y-3">
            {[t.stepProposal, t.stepProfile, t.stepDeposit].map(step => (
              <li key={step} className="flex items-center gap-3 text-ink-800">
                <span aria-hidden className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">✓</span>
                {step}
              </li>
            ))}
          </ul>
          <p className="mt-7 leading-7 text-ink-600">{t.portalIntro}</p>
          <p className="mt-2 text-sm leading-6 text-ink-500">{t.portalSignIn}</p>
          <button type="button" className="btn-primary mt-6 w-full sm:w-auto" disabled={busy} onClick={() => void openPortal()}>
            {busy ? t.opening : t.viewJourney}
          </button>
        </section>
      )}
    </Shell>
  );
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

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3 last:border-b-0">
      <dt className="text-sm text-ink-600">{label}</dt>
      <dd className={strong ? "text-lg font-bold text-ink-900" : "text-ink-800"} dir="ltr">{value}</dd>
    </div>
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
    return new Intl.NumberFormat(locale, {
      style: "currency", currency,
      minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2,
    }).format(amount);
  }
  catch { return `${amount.toLocaleString(locale)} ${currency}`; }
}
