"use client";

import { useEffect, useState } from "react";

import type { Locale } from "@/lib/i18n";

type Item = { id: string; category: string; description: string; quantity: number; unitPrice: number; optional: boolean };
type Summary = { caseNumber: string; channel: string; destinationHint: string };
type Proposal = {
  caseNumber: string; patientName: string; documentType?: string; versionNumber?: number; currency?: string;
  items: Item[]; totalMin?: number; totalExpected?: number; totalMax?: number;
  assumptions?: string; includedServices?: string; excludedServices?: string; scopeChangeReason?: string;
  paymentTerms?: string; refundTerms?: string; disclaimers?: string;
  validUntil?: string; decided: boolean; decisionState?: string;
  recommendedTreatment?: string; risksAndLimitations?: string; notes?: string;
};

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

const copy = {
  en: {
    greeting: "Prepared for", validUntil: "Valid until", servicesLabel: "Services included",
    treatmentLabel: "Clinical recommendation", risksLabel: "Risks & limitations", notesLabel: "Notes from your coordinator",
    verifyTitle: "Verify it's you", verifyIntroWhatsapp: "To protect your information, we'll send a 6-digit code to your WhatsApp",
    verifyIntroEmail: "To protect your information, we'll send a 6-digit code to your email",
    sendCode: "Send code", sending: "Sending…", codeSent: "We sent a code to", resend: "Resend code",
    codeLabel: "Enter the 6-digit code", codePlaceholder: "______", verify: "Verify", verifying: "Verifying…",
    requestRevision: "Request changes", decline: "Decline", commentLabel: "Add a note (optional)", deciding: "Submitting…",
    invalid: "This proposal link is invalid or has expired.", error: "The request could not be completed.",
    tooMany: "Too many requests. Please try again later.", loading: "Loading…", decidedAlready: "A decision has already been recorded for this document.",
    // preliminary
    prelimBadge: "Preliminary care estimate — not your final bill", prelimTitle: "Your preliminary care estimate",
    assumptionsLabel: "Important assumptions", changeLabel: "What may change after your physical assessment",
    excludedLabel: "Not included", rangeLabel: "Estimated coordinated-care package", expectedLabel: "Expected", rangeSep: "to",
    coordinationNote: "This package price includes RehletShifaa's case coordination, provider arrangements, scheduling and patient-support services.",
    ackStatement: "I understand that this estimate is based on remote review. The final treatment plan and price may increase or decrease after the treating doctor examines me. I will receive and decide on a final quote before non-emergency treatment.",
    acknowledge: "Acknowledge estimate and continue",
    // final
    finalBadge: "Final treatment plan and quote", finalTitle: "Your final treatment plan and quote",
    assessmentLabel: "Physical-assessment summary", scopeLabel: "What changed since your estimate", confirmedLabel: "Confirmed services",
    finalPriceLabel: "Final package price",
    finalConsentStatement: "I understand that accepting this quote is a financial agreement for the coordinated-care package and is not procedure-specific medical consent; my doctor will take separate informed consent before treatment.",
    acceptFinal: "Accept final treatment plan and quote",
    // done
    ackDoneTitle: "Thank you — your estimate is acknowledged", ackDoneMsg: "We've sent an invitation to activate your account so we can begin coordinating your care.",
    acceptedTitle: "Thank you — you accepted your treatment plan", acceptedMsg: "Your coordinator will confirm the next steps with you.",
    declinedTitle: "Your response was recorded", declinedMsg: "You have declined. Your coordinator remains available if anything changes.",
    revisionTitle: "Your request was sent", revisionMsg: "Your coordinator will prepare a revised document and send you a new secure link.",
  },
  ar: {
    greeting: "أُعدّ لصالح", validUntil: "صالح حتى", servicesLabel: "الخدمات المشمولة",
    treatmentLabel: "التوصية السريرية", risksLabel: "المخاطر والقيود", notesLabel: "ملاحظات من منسّق حالتك",
    verifyTitle: "لنتأكد أنه أنت", verifyIntroWhatsapp: "لحماية معلوماتك، سنرسل رمزًا من 6 أرقام إلى واتساب الخاص بك",
    verifyIntroEmail: "لحماية معلوماتك، سنرسل رمزًا من 6 أرقام إلى بريدك الإلكتروني",
    sendCode: "إرسال الرمز", sending: "جارٍ الإرسال…", codeSent: "أرسلنا رمزًا إلى", resend: "إعادة إرسال الرمز",
    codeLabel: "أدخل الرمز المكوّن من 6 أرقام", codePlaceholder: "______", verify: "تحقّق", verifying: "جارٍ التحقق…",
    requestRevision: "طلب تعديلات", decline: "رفض", commentLabel: "أضف ملاحظة (اختياري)", deciding: "جارٍ الإرسال…",
    invalid: "رابط العرض غير صالح أو منتهي الصلاحية.", error: "تعذر إكمال الطلب.",
    tooMany: "طلبات كثيرة جدًا. يُرجى المحاولة لاحقًا.", loading: "جارٍ التحميل…", decidedAlready: "تم بالفعل تسجيل قرار لهذا المستند.",
    prelimBadge: "تقدير مبدئي للرعاية — ليس فاتورتك النهائية", prelimTitle: "تقديرك المبدئي للرعاية",
    assumptionsLabel: "افتراضات مهمة", changeLabel: "ما قد يتغيّر بعد الفحص السريري",
    excludedLabel: "غير مشمول", rangeLabel: "باقة الرعاية المنسّقة التقديرية", expectedLabel: "المتوقع", rangeSep: "إلى",
    coordinationNote: "يشمل سعر الباقة تنسيق الحالة وترتيبات مقدّمي الخدمة والجدولة وخدمات دعم المريض من رحلة شفاء.",
    ackStatement: "أفهم أن هذا التقدير يستند إلى مراجعة عن بُعد. قد ترتفع أو تنخفض خطة العلاج النهائية وسعرها بعد فحص الطبيب المعالج لي. سأستلم عرضًا نهائيًا وأقرّره قبل أي علاج غير طارئ.",
    acknowledge: "الإقرار بالتقدير والمتابعة",
    finalBadge: "خطة العلاج والعرض النهائي", finalTitle: "خطة علاجك وعرضك النهائي",
    assessmentLabel: "ملخّص الفحص السريري", scopeLabel: "ما الذي تغيّر منذ تقديرك", confirmedLabel: "الخدمات المؤكدة",
    finalPriceLabel: "سعر الباقة النهائي",
    finalConsentStatement: "أفهم أن قبول هذا العرض هو اتفاق مالي على باقة الرعاية المنسّقة وليس موافقة طبية خاصة بالإجراء؛ وسيأخذ طبيبي موافقة مستنيرة منفصلة قبل العلاج.",
    acceptFinal: "قبول خطة العلاج والعرض النهائي",
    ackDoneTitle: "شكرًا لك — تم الإقرار بتقديرك", ackDoneMsg: "أرسلنا دعوة لتفعيل حسابك لنبدأ تنسيق رعايتك.",
    acceptedTitle: "شكرًا لك — لقد قبلت خطة علاجك", acceptedMsg: "سيؤكد منسّق حالتك الخطوات التالية معك.",
    declinedTitle: "تم تسجيل ردك", declinedMsg: "لقد رفضت. يبقى منسّق حالتك متاحًا إذا تغيّر أي شيء.",
    revisionTitle: "تم إرسال طلبك", revisionMsg: "سيقوم منسّق حالتك بإعداد مستند معدّل وإرسال رابط آمن جديد إليك.",
  },
};

type Phase = "loading" | "invalid" | "intro" | "code" | "view" | "done";

export function ProposalSign({ locale, token }: { locale: Locale; token: string }) {
  const t = copy[locale];
  const [phase, setPhase] = useState<Phase>("loading");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [grant, setGrant] = useState("");
  const [code, setCode] = useState("");
  const [comment, setComment] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [outcome, setOutcome] = useState<"ACCEPTED" | "DECLINED" | "REVISION_REQUESTED" | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch(`${API}/api/v1/public/proposals/${token}`)
      .then(async (r) => { if (!r.ok) throw new Error(); return r.json() as Promise<Summary>; })
      .then((s) => { setSummary(s); setPhase("intro"); })
      .catch(() => setPhase("invalid"));
  }, [token]);

  async function requestAccess() {
    setBusy(true); setError("");
    try {
      const r = await fetch(`${API}/api/v1/public/proposals/${token}/request-access`, { method: "POST" });
      if (r.status === 429) throw new Error(t.tooMany);
      if (!r.ok) throw new Error(t.error);
      setSummary((await r.json()) as Summary);
      setPhase("code");
    } catch (e) { setError(e instanceof Error && e.message ? e.message : t.error); } finally { setBusy(false); }
  }

  async function verify() {
    if (code.trim().length !== 6) return;
    setBusy(true); setError("");
    try {
      const g = await fetch(`${API}/api/v1/public/proposals/${token}/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: code.trim() }) })
        .then(async (r) => { if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { message?: string }).message ?? t.error); return r.json() as Promise<{ grant: string }>; });
      setGrant(g.grant);
      const full = await fetch(`${API}/api/v1/public/proposals/${token}/view`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grant: g.grant }) })
        .then(async (r) => { if (!r.ok) throw new Error(t.error); return r.json() as Promise<Proposal>; });
      setProposal(full);
      if (full.decided) setError(t.decidedAlready);
      setPhase("view");
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); }
  }

  async function decide(decision: "ACCEPTED" | "DECLINED" | "REVISION_REQUESTED") {
    setBusy(true); setError("");
    try {
      const r = await fetch(`${API}/api/v1/public/proposals/${token}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grant, decision, comment: comment || undefined }) });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { message?: string }).message ?? t.error);
      setOutcome(decision); setPhase("done");
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); }
  }

  const isFinal = proposal?.documentType === "FINAL_TREATMENT_QUOTE";
  const money = (n?: number) => n == null ? "—" : new Intl.NumberFormat(locale, { style: "currency", currency: proposal?.currency ?? "EGP" }).format(n);
  const itemsTotal = proposal ? proposal.items.filter((i) => !i.optional).reduce((sum, i) => sum + i.quantity * i.unitPrice, 0) : 0;
  const expected = proposal?.totalExpected ?? itemsTotal;
  const hasRange = proposal?.totalMin != null && proposal?.totalMax != null && proposal.totalMin !== proposal.totalMax;
  const ackStatement = isFinal ? t.finalConsentStatement : t.ackStatement;
  const primaryLabel = isFinal ? t.acceptFinal : t.acknowledge;
  const doneCopy = outcome === "DECLINED" ? { title: t.declinedTitle, msg: t.declinedMsg }
    : outcome === "REVISION_REQUESTED" ? { title: t.revisionTitle, msg: t.revisionMsg }
    : isFinal ? { title: t.acceptedTitle, msg: t.acceptedMsg } : { title: t.ackDoneTitle, msg: t.ackDoneMsg };

  const Section = ({ label, text }: { label: string; text?: string }) => text
    ? <div className="mt-4"><p className="text-sm font-bold text-brand-700">{label}</p><p className="mt-1 whitespace-pre-line text-ink-700">{text}</p></div> : null;

  return (
    <section className="section bg-mist">
      <div className="container-site max-w-2xl">
        {phase === "loading" && <p className="card p-6" aria-live="polite">{t.loading}</p>}
        {phase === "invalid" && <p role="alert" className="card bg-alert-50 p-6 text-alert-800">{t.invalid}</p>}

        {(phase === "intro" || phase === "code") && summary && (
          <div className="card p-6 sm:p-8">
            <p className="eyebrow">RehletShifaa · {summary.caseNumber}</p>
            <h1 className="headline mt-2">{t.verifyTitle}</h1>
            <p className="mt-3 text-ink-700">{summary.channel === "WHATSAPP" ? t.verifyIntroWhatsapp : t.verifyIntroEmail} <strong dir="ltr">{summary.destinationHint}</strong>.</p>
            {phase === "intro" ? (
              <button className="btn-primary mt-6 w-full" disabled={busy} onClick={() => void requestAccess()}>{busy ? t.sending : t.sendCode}</button>
            ) : (
              <>
                <p className="mt-4 text-sm text-ink-600">{t.codeSent} <strong dir="ltr">{summary.destinationHint}</strong></p>
                <label className="mt-4 block text-sm font-bold">{t.codeLabel}
                  <input className="field mt-2 text-center tracking-[0.5em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder={t.codePlaceholder} aria-label={t.codeLabel} />
                </label>
                {error && <p role="alert" className="mt-4 rounded-xl bg-alert-50 p-3 text-alert-800">{error}</p>}
                <button className="btn-primary mt-6 w-full" disabled={busy || code.trim().length !== 6} onClick={() => void verify()}>{busy ? t.verifying : t.verify}</button>
                <button className="mt-3 w-full text-sm font-bold text-brand-700 underline disabled:opacity-50" disabled={busy} onClick={() => void requestAccess()}>{t.resend}</button>
              </>
            )}
          </div>
        )}

        {phase === "view" && proposal && (
          <div className="card p-6 sm:p-8">
            <span className="inline-block rounded-full px-3 py-1 text-xs font-bold" style={isFinal ? { background: "var(--brand-600, #0E6E5C)", color: "#fff" } : { background: "#F4E9CF", color: "#8a6620" }}>{isFinal ? t.finalBadge : t.prelimBadge}</span>
            <h1 className="headline mt-3">{isFinal ? t.finalTitle : t.prelimTitle}</h1>
            <p className="mt-2 text-ink-600">{t.greeting} <strong>{proposal.patientName}</strong> · {proposal.caseNumber}{proposal.versionNumber ? ` · v${proposal.versionNumber}` : ""}</p>

            <Section label={isFinal ? t.assessmentLabel : t.treatmentLabel} text={proposal.recommendedTreatment} />
            {isFinal && <Section label={t.scopeLabel} text={proposal.scopeChangeReason} />}
            {!isFinal && <Section label={t.assumptionsLabel} text={proposal.assumptions} />}
            <Section label={isFinal ? t.risksLabel : t.changeLabel} text={proposal.risksAndLimitations} />

            <p className="mt-6 text-sm font-bold text-brand-700">{isFinal ? t.confirmedLabel : t.servicesLabel}</p>
            <ul className="mt-2 divide-y divide-line">
              {proposal.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-4 py-3">
                  <span>{item.description}{item.optional ? " (optional)" : ""}</span>
                  <span className="font-bold">{money(item.quantity * item.unitPrice)}</span>
                </li>
              ))}
            </ul>
            {proposal.excludedServices && <p className="mt-3 text-sm text-ink-500"><span className="font-bold">{t.excludedLabel}:</span> {proposal.excludedServices}</p>}

            <div className="mt-5 rounded-xl bg-brand-50 p-4">
              <p className="text-sm font-bold text-brand-800">{isFinal ? t.finalPriceLabel : t.rangeLabel}</p>
              {hasRange
                ? <p className="mt-1 text-2xl font-bold text-ink-900">{money(proposal.totalMin)} <span className="text-base font-normal text-ink-500">{t.rangeSep}</span> {money(proposal.totalMax)}</p>
                : <p className="mt-1 text-2xl font-bold text-ink-900">{money(expected)}</p>}
              {hasRange && <p className="mt-1 text-sm text-ink-600">{t.expectedLabel}: <strong>{money(expected)}</strong></p>}
              <p className="mt-2 text-xs leading-5 text-ink-600">{t.coordinationNote}</p>
            </div>

            <Section label={t.notesLabel} text={proposal.notes} />
            {proposal.disclaimers && <p className="mt-4 text-xs text-ink-500">{proposal.disclaimers}</p>}
            {proposal.validUntil && <p className="mt-2 text-sm text-ink-500">{t.validUntil} {new Intl.DateTimeFormat(locale).format(new Date(proposal.validUntil))}</p>}

            {proposal.decided ? (
              <p role="alert" className="mt-6 rounded-xl bg-mist p-4 text-ink-700">{t.decidedAlready}</p>
            ) : (
              <>
                <label className="mt-8 flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-white p-4">
                  <input type="checkbox" className="mt-1 h-5 w-5 accent-brand-600" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
                  <span className="text-sm leading-6 text-ink-700">{ackStatement}</span>
                </label>
                <label className="mt-4 block text-sm font-bold">{t.commentLabel}
                  <textarea className="field mt-2" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
                </label>
                {error && <p role="alert" className="mt-4 rounded-xl bg-alert-50 p-3 text-alert-800">{error}</p>}
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <button className="btn-primary" disabled={busy || !acknowledged} onClick={() => void decide("ACCEPTED")}>{busy ? t.deciding : primaryLabel}</button>
                  <button className="btn-secondary" disabled={busy} onClick={() => void decide("REVISION_REQUESTED")}>{t.requestRevision}</button>
                  <button className="btn-secondary" disabled={busy} onClick={() => void decide("DECLINED")}>{t.decline}</button>
                </div>
              </>
            )}
          </div>
        )}

        {phase === "done" && (
          <div className="card p-8 text-center">
            <h1 className="headline">{doneCopy.title}</h1>
            <p className="lead mt-4">{doneCopy.msg}</p>
          </div>
        )}
      </div>
    </section>
  );
}
