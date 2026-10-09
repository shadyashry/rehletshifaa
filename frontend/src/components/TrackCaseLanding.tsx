"use client";

import Link from "next/link";
import {
  AlertCircle, ArrowRight, CheckCircle2, ChevronDown, ClipboardList, Hash, History, KeyRound, LoaderCircle,
  LockKeyhole, LogIn, MessageCircle, RotateCcw, ShieldCheck, Smartphone,
} from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import { JourneyLine } from "@/components/home/JourneyConnector";
import type { Locale } from "@/lib/i18n";
import { whatsappHref } from "@/lib/links";
import { apiUrl } from "@/lib/api";

const copy = {
  en: {
    eyebrow: "Private patient access",
    title: "Track your case securely",
    intro: "Enter your case number and the WhatsApp number you used when you sent your case. We will send a fresh, private tracking link to that number.",
    savedTitle: "Continue where you left off",
    savedBody: "This browser has the private tracking link from when you sent your case.",
    savedAction: "Open my saved link",
    caseId: "Case number",
    caseIdHint: "Format: RS-2026-000123",
    caseIdInvalid: "Enter the case number in the format RS-2026-000123.",
    whatsapp: "Registered WhatsApp number",
    whatsappHint: "The number on your case, with the country code — for example +20 100 000 0000.",
    whatsappInvalid: "Enter a WhatsApp number with its country code, for example +20 100 000 0000.",
    send: "Send my secure tracking link",
    sending: "Sending securely…",
    findId: "Where can I find my case number?",
    findIdBody: "It is shown on the confirmation screen right after you send your case, and in the secure WhatsApp message from our team.",
    findIdExample: "Case received",
    findIdExampleLabel: "Case number",
    errorRate: "Too many attempts. For your security, please wait a few minutes and try again.",
    errorInvalid: "Please check the case number and WhatsApp number and try again.",
    errorNetwork: "We couldn't reach our servers. Check your connection and try again.",
    sentTitle: "Check your WhatsApp",
    sentBody: "If these details match your case, a private tracking link is on its way to the WhatsApp number on your case.",
    sentFor: (caseId: string, ending: string) => `Requested for ${caseId} · number ending ${ending}`,
    sentSteps: ["Open the private link we sent on WhatsApp", "Enter the 6-digit code we send you", "See your case status and next step"],
    sentNote: "The link stays valid for 30 days. For your security, we limit how many links are sent each hour.",
    resend: "Send again",
    resendIn: (s: number) => `Send again in ${s}s`,
    different: "Use different details",
    howTitle: "How secure tracking works",
    how: [
      { title: "Your details", body: "Your case number and the WhatsApp number on your case." },
      { title: "A private link", body: "Sent only to the number already stored on your case." },
      { title: "A 6-digit code", body: "A fresh code confirms it's you before anything is shown." },
      { title: "Your case status", body: "Where your case is, and what happens next." },
    ],
    privacy: "For your privacy we never confirm whether a case number or phone number exists — the same message appears either way.",
    accountTitle: "Already activated your account?",
    accountBody: "Once you have completed your profile and created a password, sign in instead — your case opens directly.",
    signIn: "Sign in to the secure portal",
    helpTitle: "Need help?",
    helpBody: "Your coordinator can help you find your case number or update your number.",
    contact: "Talk to a coordinator",
  },
  ar: {
    eyebrow: "وصول خاص للمريض",
    title: "تابع حالتك بأمان",
    intro: "أدخل رقم الحالة ورقم واتساب الذي استخدمته عند إرسال حالتك، وسنرسل رابط متابعة خاصًا وجديدًا إلى هذا الرقم.",
    savedTitle: "تابع من حيث توقفت",
    savedBody: "يحتفظ هذا المتصفح برابط المتابعة الخاص منذ إرسال حالتك.",
    savedAction: "فتح الرابط المحفوظ",
    caseId: "رقم الحالة",
    caseIdHint: "الصيغة: RS-2026-000123",
    caseIdInvalid: "أدخل رقم الحالة بالصيغة RS-2026-000123.",
    whatsapp: "رقم واتساب المسجّل",
    whatsappHint: "الرقم المسجّل في حالتك مع رمز الدولة — مثل ‎+20 100 000 0000.",
    whatsappInvalid: "أدخل رقم واتساب مع رمز الدولة، مثل ‎+20 100 000 0000.",
    send: "إرسال رابط المتابعة الآمن",
    sending: "جارٍ الإرسال بأمان…",
    findId: "أين أجد رقم الحالة؟",
    findIdBody: "يظهر في شاشة التأكيد مباشرة بعد إرسال حالتك، وفي رسالة واتساب الآمنة من فريقنا.",
    findIdExample: "تم استلام الحالة",
    findIdExampleLabel: "رقم الحالة",
    errorRate: "محاولات كثيرة. لحمايتك، انتظر بضع دقائق ثم حاول مرة أخرى.",
    errorInvalid: "تحقق من رقم الحالة ورقم واتساب وحاول مرة أخرى.",
    errorNetwork: "تعذر الوصول إلى خوادمنا. تحقق من اتصالك وحاول مرة أخرى.",
    sentTitle: "تحقق من واتساب",
    sentBody: "إذا تطابقت هذه البيانات مع حالتك، فرابط المتابعة الخاص في طريقه إلى رقم واتساب المسجّل في حالتك.",
    sentFor: (caseId: string, ending: string) => `طُلب للحالة ${caseId} · رقم ينتهي بـ ${ending}`,
    sentSteps: ["افتح الرابط الخاص الذي أرسلناه على واتساب", "أدخل الرمز المكوّن من 6 أرقام الذي نرسله إليك", "اطّلع على حالة طلبك والخطوة التالية"],
    sentNote: "يبقى الرابط صالحًا لمدة 30 يومًا. ولحمايتك، نحدّ من عدد الروابط المرسلة كل ساعة.",
    resend: "إعادة الإرسال",
    resendIn: (s: number) => `إعادة الإرسال بعد ${s} ث`,
    different: "استخدام بيانات أخرى",
    howTitle: "كيف تعمل المتابعة الآمنة",
    how: [
      { title: "بياناتك", body: "رقم الحالة ورقم واتساب المسجّل في حالتك." },
      { title: "رابط خاص", body: "يُرسل فقط إلى الرقم المحفوظ مسبقًا في حالتك." },
      { title: "رمز من 6 أرقام", body: "رمز جديد يؤكد هويتك قبل عرض أي معلومات." },
      { title: "حالة طلبك", body: "أين وصلت حالتك، وما الخطوة التالية." },
    ],
    privacy: "لحماية خصوصيتك، لا نؤكد وجود رقم الحالة أو الرقم — تظهر الرسالة نفسها في الحالتين.",
    accountTitle: "هل فعّلت حسابك بالفعل؟",
    accountBody: "بعد إكمال ملفك وإنشاء كلمة المرور، سجّل الدخول مباشرة — تُفتح حالتك فورًا.",
    signIn: "تسجيل الدخول إلى البوابة الآمنة",
    helpTitle: "تحتاج إلى مساعدة؟",
    helpBody: "يمكن لمنسق المرضى مساعدتك في إيجاد رقم الحالة أو تحديث رقمك.",
    contact: "تحدث مع منسق",
  },
} as const;

const savedPathPattern = /^\/(?:en|ar)\/status\/[A-Za-z0-9_-]{32,}$/;
const SAVED_KEY = "rehletshifaa:last-status-path";

/** The status link saved by this browser when the case was sent; null on the server or without storage. */
function readSavedPath(): string | null {
  try {
    return window.localStorage.getItem(SAVED_KEY);
  } catch {
    return null; // storage can be unavailable (private mode) — the form works without it
  }
}
function subscribeSavedPath(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
/** Mirrors the API's own rules (CaseLinkRecoveryRequest) so invalid input never leaves the browser. */
const CASE_ID = /^RS-\d{4}-\d{6}$/;
const WHATSAPP = /^\+?[0-9][0-9\s()-]{6,24}$/;
const RESEND_SECONDS = 60;

/** Shapes typed or pasted input into RS-YYYY-NNNNNN: "rs 2026 123" or "2026123" both become RS-2026-123. */
export function formatCaseId(raw: string): string {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const digits = compact.replace(/^R?S?/, "").replace(/\D/g, "").slice(0, 10);
  if (!digits) return compact.startsWith("RS") ? "RS" : compact.startsWith("R") ? "R" : "";
  return `RS-${digits.slice(0, 4)}${digits.length > 4 ? `-${digits.slice(4)}` : ""}`;
}

type Failure = "rate" | "invalid" | "network";

/**
 * Case tracking for patients who have not activated an account: they confirm the case number and the WhatsApp
 * number on their case, and a fresh private status link is sent to that stored number. The API answers
 * the same way whether or not a case matches, so the success state never says more than that. Beside the
 * form, the four-step secure flow; a saved link on this browser is offered first; the patient can resend
 * after a short cooldown, and every failure says what actually went wrong.
 */
export function TrackCaseLanding({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const ids = { caseId: useId(), whatsapp: useId(), caseHint: useId(), whatsappHint: useId() };
  const [caseNumber, setCaseNumber] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [touched, setTouched] = useState({ caseId: false, whatsapp: false });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<Failure>();
  const [cooldown, setCooldown] = useState(0);
  const sentHeading = useRef<HTMLHeadingElement>(null);

  const savedRaw = useSyncExternalStore(subscribeSavedPath, readSavedPath, () => null);
  const savedCandidate = savedRaw && savedPathPattern.test(savedRaw) ? savedRaw.replace(/^\/(?:en|ar)/, `/${locale}`) : undefined;
  // The stored link may be stale (expired, or replaced by a newer link), so it is offered only once the API
  // still recognises it; a rejected link is forgotten so the shortcut never leads to a dead end.
  const [verifiedPath, setVerifiedPath] = useState<string>();
  const savedPath = savedCandidate && verifiedPath === savedCandidate ? savedCandidate : undefined;

  useEffect(() => {
    if (!savedCandidate) return;
    const token = savedCandidate.split("/").pop();
    let active = true;
    fetch(apiUrl(`/public/cases/${token}`))
      .then((response) => {
        if (!active) return;
        if (response.ok) return setVerifiedPath(savedCandidate);
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          try { window.localStorage.removeItem(SAVED_KEY); } catch { /* storage unavailable */ }
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [savedCandidate]);

  // Move focus to the confirmation once it has rendered, so screen-reader and keyboard users land on it.
  useEffect(() => {
    if (sent) sentHeading.current?.focus();
  }, [sent]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const caseValid = CASE_ID.test(caseNumber);
  const whatsappValid = WHATSAPP.test(whatsappNumber.trim()) && whatsappNumber.replace(/\D/g, "").length >= 7;
  const showCaseError = touched.caseId && !caseValid;
  const showWhatsappError = touched.whatsapp && !whatsappValid;

  async function send() {
    setBusy(true);
    setFailure(undefined);
    try {
      const response = await fetch(apiUrl(`/public/cases/recover`), {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Request-ID": crypto.randomUUID() },
        body: JSON.stringify({ caseNumber, whatsappNumber: whatsappNumber.trim(), language: locale }),
      });
      if (response.status === 429) return setFailure("rate");
      if (response.status === 400) return setFailure("invalid");
      if (!response.ok) return setFailure("network");
      setSent(true);
      setCooldown(RESEND_SECONDS);
    } catch {
      setFailure("network");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setTouched({ caseId: true, whatsapp: true });
    if (!caseValid || !whatsappValid) return;
    void send();
  }

  function reset() {
    setSent(false);
    setFailure(undefined);
    setTouched({ caseId: false, whatsapp: false });
  }

  const ending = whatsappNumber.replace(/\D/g, "").slice(-2);
  const failureText = failure === "rate" ? t.errorRate : failure === "invalid" ? t.errorInvalid : failure === "network" ? t.errorNetwork : "";
  const input = (invalid: boolean) =>
    `h-12 w-full rounded-xl border bg-surface-default px-4 text-[1rem] text-brand-900 placeholder:text-ink-400 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
      invalid ? "border-alert-600 focus-visible:outline-alert-600" : "border-border-card hover:border-brand-300 focus-visible:border-brand-500 focus-visible:outline-brand-600"
    }`;

  return (
    <section className="bg-surface-pearl bg-[radial-gradient(70%_60%_at_85%_0%,var(--color-surface-clinical),var(--color-surface-pearl)_70%)] pb-16 pt-10 md:pb-20 md:pt-14">
      <div className="container-site">
        <div className="max-w-[46rem]">
          <p className="eyebrow">{t.eyebrow}</p>
          <h1 className="display mt-3 [text-wrap:balance]">{t.title}</h1>
          <p className="lead mt-4 max-w-[58ch]">{t.intro}</p>
        </div>

        {savedPath ? (
          <div className="mt-7 flex flex-col gap-4 rounded-[18px] border border-brand-300 bg-surface-default p-5 shadow-[0_18px_40px_-32px_rgba(36,64,74,0.5)] sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex items-start gap-3.5">
              <span aria-hidden className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-surface-clinical text-brand-700 ring-1 ring-border-clinical"><History size={20} strokeWidth={1.8} /></span>
              <div>
                <p className="text-[1.0625rem] font-semibold text-brand-900">{t.savedTitle}</p>
                <p className="mt-0.5 text-[0.9375rem] leading-6 text-ink-600">{t.savedBody}</p>
              </div>
            </div>
            <Link href={savedPath} className="btn-primary w-full flex-none sm:w-auto">
              {t.savedAction}
              <ArrowRight size={17} aria-hidden="true" className="rtl:-scale-x-100" />
            </Link>
          </div>
        ) : null}

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-8">
          {/* The form, or — once sent — what happens next. */}
          <div className="rounded-[22px] border border-border-card bg-surface-default p-6 shadow-[0_30px_60px_-46px_rgba(36,64,74,0.6)] sm:p-8">
            {sent ? (
              <div>
                <span aria-hidden className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-700 text-white shadow-[0_12px_28px_-14px_rgba(31,107,115,0.8)]"><CheckCircle2 size={26} strokeWidth={1.8} /></span>
                <h2 ref={sentHeading} tabIndex={-1} className="mt-5 text-[1.75rem] font-semibold leading-tight tracking-[-0.015em] text-brand-900 outline-none rtl:tracking-normal">{t.sentTitle}</h2>
                <p role="status" className="mt-2 max-w-[52ch] text-[1rem] leading-7 text-ink-600">{t.sentBody}</p>
                <p className="mt-4 inline-flex flex-wrap items-center gap-2 rounded-xl bg-surface-clinical px-3.5 py-2 text-[0.875rem] font-medium text-brand-800 ring-1 ring-border-clinical">
                  <Smartphone size={15} aria-hidden="true" />
                  <bdi>{t.sentFor(caseNumber, `••${ending}`)}</bdi>
                </p>
                <ol className="mt-6 grid gap-3">
                  {t.sentSteps.map((step, index) => (
                    <li key={step} className="flex items-center gap-3 text-[0.9375rem] leading-6 text-ink-700">
                      <span aria-hidden className="grid h-8 w-8 flex-none place-items-center rounded-full bg-surface-default text-[0.8125rem] font-semibold text-brand-800 ring-[1.5px] ring-brand-500">{index + 1}</span>
                      {step}
                    </li>
                  ))}
                </ol>
                <p className="mt-5 text-[0.875rem] leading-6 text-ink-500">{t.sentNote}</p>
                {failureText ? <FailureMessage text={failureText} /> : null}
                <div className="mt-6 flex flex-col gap-3 border-t border-border-subtle pt-5 sm:flex-row sm:flex-wrap sm:items-center">
                  <button type="button" onClick={() => void send()} disabled={cooldown > 0 || busy} className="btn-secondary w-full gap-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">
                    {busy ? <LoaderCircle size={17} aria-hidden="true" className="animate-spin" /> : <RotateCcw size={17} aria-hidden="true" />}
                    {cooldown > 0 ? t.resendIn(cooldown) : t.resend}
                  </button>
                  <button type="button" onClick={reset} className="link-cta justify-center text-[0.9375rem] sm:justify-start">{t.different}</button>
                </div>
              </div>
            ) : (
              <form noValidate onSubmit={submit}>
                <div>
                  <label htmlFor={ids.caseId} className="flex items-center gap-2 text-[0.9375rem] font-semibold text-brand-900">
                    <Hash size={16} aria-hidden="true" className="text-brand-600" />
                    {t.caseId}
                  </label>
                  <input
                    id={ids.caseId}
                    dir="ltr"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    inputMode="text"
                    maxLength={14}
                    placeholder="RS-2026-000123"
                    aria-invalid={showCaseError}
                    aria-describedby={ids.caseHint}
                    value={caseNumber}
                    onChange={(event) => setCaseNumber(formatCaseId(event.target.value))}
                    onBlur={() => setTouched((v) => ({ ...v, caseId: true }))}
                    className={`${input(showCaseError)} mt-2 font-mono tracking-[0.08em]`}
                  />
                  <p id={ids.caseHint} className={`mt-2 flex items-start gap-1.5 text-[0.8125rem] leading-5 ${showCaseError ? "font-medium text-alert-700" : "text-ink-500"}`}>
                    {showCaseError ? <AlertCircle size={15} aria-hidden="true" className="mt-px flex-none" /> : null}
                    {showCaseError ? t.caseIdInvalid : t.caseIdHint}
                  </p>
                </div>

                <details className="group/find mt-3 rounded-xl bg-surface-pearl ring-1 ring-border-subtle">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-[0.875rem] font-semibold text-brand-700 [&::-webkit-details-marker]:hidden">
                    {t.findId}
                    <ChevronDown size={16} aria-hidden="true" className="flex-none transition-transform group-open/find:rotate-180" />
                  </summary>
                  <div className="grid gap-4 px-4 pb-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <p className="text-[0.875rem] leading-6 text-ink-600">{t.findIdBody}</p>
                    <div aria-hidden className="rounded-xl bg-surface-default p-3.5 shadow-[0_10px_24px_-18px_rgba(36,64,74,0.6)] ring-1 ring-border-card">
                      <p className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-brand-800"><CheckCircle2 size={14} className="text-brand-600" />{t.findIdExample}</p>
                      <p className="mt-2 text-[0.75rem] text-ink-500">{t.findIdExampleLabel}</p>
                      <p dir="ltr" className="mt-0.5 rounded-md bg-brand-50 px-2 py-1 font-mono text-[0.9375rem] font-semibold tracking-[0.08em] text-brand-800 ring-1 ring-brand-200">RS-2026-000123</p>
                    </div>
                  </div>
                </details>

                <div className="mt-6">
                  <label htmlFor={ids.whatsapp} className="flex items-center gap-2 text-[0.9375rem] font-semibold text-brand-900">
                    <MessageCircle size={16} aria-hidden="true" className="text-brand-600" />
                    {t.whatsapp}
                  </label>
                  <input
                    id={ids.whatsapp}
                    dir="ltr"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="+20 100 000 0000"
                    aria-invalid={showWhatsappError}
                    aria-describedby={ids.whatsappHint}
                    value={whatsappNumber}
                    onChange={(event) => setWhatsappNumber(event.target.value.replace(/[^\d\s()+-]/g, ""))}
                    onBlur={() => setTouched((v) => ({ ...v, whatsapp: true }))}
                    className={`${input(showWhatsappError)} mt-2 text-start`}
                  />
                  <p id={ids.whatsappHint} className={`mt-2 flex items-start gap-1.5 text-[0.8125rem] leading-5 ${showWhatsappError ? "font-medium text-alert-700" : "text-ink-500"}`}>
                    {showWhatsappError ? <AlertCircle size={15} aria-hidden="true" className="mt-px flex-none" /> : null}
                    {showWhatsappError ? t.whatsappInvalid : t.whatsappHint}
                  </p>
                </div>

                {failureText ? <FailureMessage text={failureText} /> : null}

                <button type="submit" disabled={busy} className="btn-primary mt-7 w-full gap-2 disabled:cursor-wait disabled:opacity-80">
                  {busy ? <LoaderCircle size={18} aria-hidden="true" className="animate-spin" /> : <LockKeyhole size={17} aria-hidden="true" />}
                  {busy ? t.sending : t.send}
                </button>
                <p className="mt-4 flex items-start gap-2 text-[0.8125rem] leading-5 text-ink-500">
                  <ShieldCheck size={15} aria-hidden="true" className="mt-px flex-none text-brand-600" />
                  {t.privacy}
                </p>
              </form>
            )}
          </div>

          {/* How it works, then the two other routes: sign in, or a coordinator. */}
          <div className="grid gap-5">
            <div className="rounded-[22px] border border-border-clinical bg-surface-clinical p-6 sm:p-7">
              <p className="text-[1.0625rem] font-semibold text-brand-900">{t.howTitle}</p>
              <ol className="mt-5">
                {t.how.map((step, index) => {
                  const Icon = [KeyRound, MessageCircle, ShieldCheck, ClipboardList][index] ?? KeyRound;
                  const last = index === t.how.length - 1;
                  return (
                    <li key={step.title} className="relative flex gap-4 pb-5 last:pb-0">
                      {last ? null : (
                        <div aria-hidden className="absolute -bottom-1 start-[1.375rem] top-11 w-6 -translate-x-1/2 rtl:translate-x-1/2"><JourneyLine className="h-full w-full" /></div>
                      )}
                      <span aria-hidden className={`relative grid h-11 w-11 flex-none place-items-center rounded-full ${last ? "bg-brand-700 text-white" : "bg-surface-default text-brand-800 ring-[1.5px] ring-brand-500"}`}>
                        <Icon size={18} strokeWidth={1.8} />
                      </span>
                      <div className="pt-1">
                        <p className="text-[0.9375rem] font-semibold leading-6 text-brand-900">{step.title}</p>
                        <p className="text-[0.875rem] leading-6 text-ink-600">{step.body}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>

            <div className="rounded-[18px] border border-border-card bg-surface-default p-5 sm:p-6">
              <p className="flex items-center gap-2 text-[1rem] font-semibold text-brand-900"><LogIn size={17} aria-hidden="true" className="text-brand-600 rtl:-scale-x-100" />{t.accountTitle}</p>
              <p className="mt-1.5 text-[0.875rem] leading-6 text-ink-600">{t.accountBody}</p>
              <Link href={`/${locale}/portal?signin=1`} className="link-cta mt-2 text-[0.9375rem]">
                {t.signIn}
                <ArrowRight size={16} aria-hidden="true" className="rtl:-scale-x-100" />
              </Link>
            </div>

            <div className="rounded-[18px] border border-border-card bg-surface-default p-5 sm:p-6">
              <p className="flex items-center gap-2 text-[1rem] font-semibold text-brand-900"><MessageCircle size={17} aria-hidden="true" className="text-brand-600" />{t.helpTitle}</p>
              <p className="mt-1.5 text-[0.875rem] leading-6 text-ink-600">{t.helpBody}</p>
              <a href={whatsappHref()} target="_blank" rel="noopener noreferrer" className="link-cta mt-2 text-[0.9375rem]">
                {t.contact}
                <ArrowRight size={16} aria-hidden="true" className="rtl:-scale-x-100" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FailureMessage({ text }: { text: string }) {
  return (
    <p role="alert" className="mt-5 flex items-start gap-2.5 rounded-xl border border-alert-200 bg-alert-50 px-4 py-3 text-[0.9375rem] leading-6 text-alert-800">
      <AlertCircle size={18} aria-hidden="true" className="mt-0.5 flex-none" />
      {text}
    </p>
  );
}
