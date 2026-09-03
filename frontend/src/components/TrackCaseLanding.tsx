"use client";

import Link from "next/link";
import { LockKeyhole, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";

import type { Locale } from "@/lib/i18n";
import { whatsappHref } from "@/lib/links";

const copy = {
  en: {
    eyebrow: "Private patient access",
    title: "Track your case securely",
    intro: "Enter the Case ID and WhatsApp number used when you submitted your case. We will send you a fresh private tracking link.",
    caseId: "Case ID",
    whatsapp: "Confirm your registered WhatsApp number",
    whatsappHelp: "Enter the number used when submitting your case, including the country code. We only send the link to the number already stored on your case.",
    send: "Send my secure tracking link",
    sending: "Sending securely…",
    sent: "If the details match your case, a secure tracking link will be sent to your WhatsApp shortly.",
    error: "We couldn't process the request. Please check the details and try again.",
    continue: "Continue with the link saved on this browser",
    contact: "Ask a patient coordinator",
    accountTitle: "Already activated your patient account?",
    accountBody: "Sign in to the secure care portal to see your complete care journey.",
    signIn: "Sign in to the secure portal",
    privacy: "For your privacy, we never confirm publicly whether a Case ID or WhatsApp number exists. The tracking link still requires a new 6-digit verification code before any case information is shown.",
  },
  ar: {
    eyebrow: "وصول خاص للمريض",
    title: "تابع حالتك بأمان",
    intro: "أدخل رقم الحالة ورقم واتساب المستخدم عند إرسالها، وسنرسل إليك رابط متابعة خاصًا جديدًا.",
    caseId: "رقم الحالة",
    whatsapp: "تأكيد رقم واتساب المسجّل",
    whatsappHelp: "أدخل الرقم المستخدم عند إرسال حالتك مع رمز الدولة. نرسل الرابط فقط إلى الرقم المحفوظ مسبقًا في حالتك.",
    send: "إرسال رابط المتابعة الآمن",
    sending: "جارٍ الإرسال بأمان…",
    sent: "إذا تطابقت البيانات مع حالتك، فسيُرسل رابط متابعة آمن إلى واتساب قريبًا.",
    error: "تعذر معالجة الطلب. تحقق من البيانات وحاول مرة أخرى.",
    continue: "المتابعة بالرابط المحفوظ على هذا المتصفح",
    contact: "تواصل مع منسق المرضى",
    accountTitle: "هل فعّلت حساب المريض بالفعل؟",
    accountBody: "سجّل الدخول إلى بوابة الرعاية الآمنة لمشاهدة رحلة رعايتك كاملة.",
    signIn: "تسجيل الدخول إلى البوابة الآمنة",
    privacy: "لحماية خصوصيتك، لا نؤكد علنًا وجود رقم الحالة أو رقم واتساب. ويظل رابط المتابعة محميًا برمز تحقق جديد من 6 أرقام قبل عرض أي معلومات.",
  },
} as const;

const savedPathPattern = /^\/(?:en|ar)\/status\/[A-Za-z0-9_-]{32,}$/;

export function TrackCaseLanding({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const [savedPath, setSavedPath] = useState<string>();
  const [caseNumber, setCaseNumber] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

  useEffect(() => {
    const saved = window.localStorage.getItem("rehletshifaa:last-status-path");
    if (saved && savedPathPattern.test(saved)) setSavedPath(saved.replace(/^\/(?:en|ar)/, `/${locale}`));
  }, [locale]);

  async function recover(event: React.FormEvent) {
    event.preventDefault();setBusy(true);setNotice("");setError("");
    try {
      const response=await fetch(`${apiBase}/api/v1/public/cases/recover`,{method:"POST",headers:{"Content-Type":"application/json","X-Request-ID":crypto.randomUUID()},body:JSON.stringify({caseNumber:caseNumber.trim(),whatsappNumber:whatsappNumber.trim(),language:locale})});
      if(!response.ok)throw new Error();
      setNotice(t.sent);
    } catch {setError(t.error);} finally {setBusy(false);}
  }

  return (
    <section className="section bg-mist">
      <div className="container-site max-w-3xl">
        <div className="card p-7 md:p-10">
          <p className="eyebrow">{t.eyebrow}</p>
          <h1 className="headline mt-3">{t.title}</h1>
          <p className="lead mt-5">{t.intro}</p>

          <form className="mt-7 space-y-5" onSubmit={recover}>
            <label className="block"><span className="mb-2 block text-sm font-bold text-ink-800">{t.caseId}</span><input className="field" required maxLength={20} placeholder="RS-2026-000001" value={caseNumber} onChange={event=>setCaseNumber(event.target.value.toUpperCase())}/></label>
            <label className="block"><span className="mb-2 block text-sm font-bold text-ink-800">{t.whatsapp}</span><input className="field" required dir="ltr" inputMode="tel" autoComplete="tel" placeholder="+20 100 000 0000" value={whatsappNumber} onChange={event=>setWhatsappNumber(event.target.value)}/><span className="mt-2 block text-sm text-ink-500">{t.whatsappHelp}</span></label>
            <button className="btn-primary w-full sm:w-auto" disabled={busy}>{busy?t.sending:t.send}</button>
          </form>

          {notice&&<p className="mt-6 rounded-xl border border-brand-200 bg-brand-50 p-5 text-brand-900" role="status">{notice}</p>}
          {error&&<p className="mt-6 rounded-xl border border-alert-200 bg-alert-50 p-5 text-alert-800" role="alert">{error}</p>}
          <p className="mt-6 flex items-start gap-3 text-sm leading-6 text-ink-600"><LockKeyhole className="mt-1 shrink-0 text-accent-700" size={18} aria-hidden="true"/><span>{t.privacy}</span></p>
          <div className="mt-6 flex flex-wrap gap-3">
            {savedPath&&<Link className="btn-secondary" href={savedPath}>{t.continue}</Link>}
            <a className="btn-secondary" href={whatsappHref()} target="_blank" rel="noopener noreferrer"><MessageCircle className="me-2 inline" size={17} aria-hidden="true"/>{t.contact}</a>
          </div>

          <div className="mt-7 border-t border-line pt-7">
            <h2 className="title">{t.accountTitle}</h2>
            <p className="mt-2 text-ink-600">{t.accountBody}</p>
            <Link className="btn-secondary mt-5" href={`/${locale}/portal`}>{t.signIn}</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
