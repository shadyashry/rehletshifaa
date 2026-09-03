"use client";

import { useEffect, useState } from "react";

import type { Locale } from "@/lib/i18n";

type Item = { id: string; category: string; description: string; quantity: number; unitPrice: number; optional: boolean };
type Summary = { caseNumber: string; channel: string; destinationHint: string };
type Proposal = { caseNumber: string; patientName: string; currency?: string; items: Item[]; validUntil?: string; decided: boolean; recommendedTreatment?: string; risksAndLimitations?: string; notes?: string };

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

const copy = {
  en: {
    title: "Your treatment proposal", greeting: "Prepared for", total: "Total", validUntil: "Valid until",
    treatmentLabel: "Recommended treatment", risksLabel: "Risks & limitations", servicesLabel: "Services & costs", notesLabel: "Notes from your coordinator",
    verifyTitle: "Verify it's you", verifyIntroWhatsapp: "To protect your information, we'll send a 6-digit code to your WhatsApp",
    verifyIntroEmail: "To protect your information, we'll send a 6-digit code to your email",
    sendCode: "Send code", sending: "Sending…", codeSent: "We sent a code to", resend: "Resend code",
    codeLabel: "Enter the 6-digit code", codePlaceholder: "______", verify: "Verify", verifying: "Verifying…",
    accept: "Accept proposal", decline: "Decline", requestRevision: "Request changes",
    commentLabel: "Add a note (optional)", deciding: "Submitting…",
    acceptedTitle: "Thank you — you accepted your proposal", acceptedMsg: "We've sent an invitation to activate your account and continue your journey.",
    declinedTitle: "Your response was recorded", declinedMsg: "You have declined this proposal. You do not need an account. Your coordinator remains available if anything changes.",
    revisionTitle: "Your request was sent", revisionMsg: "Your coordinator will prepare a revised proposal and send you a new secure link.",
    invalid: "This proposal link is invalid or has expired.", error: "The request could not be completed.",
    tooMany: "Too many requests. Please try again later.", loading: "Loading…", decidedAlready: "A decision has already been recorded for this proposal.",
  },
  ar: {
    title: "عرض العلاج الخاص بك", greeting: "أُعدّ لصالح", total: "الإجمالي", validUntil: "صالح حتى",
    treatmentLabel: "العلاج الموصى به", risksLabel: "المخاطر والقيود", servicesLabel: "الخدمات والتكاليف", notesLabel: "ملاحظات من منسّق حالتك",
    verifyTitle: "لنتأكد أنه أنت", verifyIntroWhatsapp: "لحماية معلوماتك، سنرسل رمزًا من 6 أرقام إلى واتساب الخاص بك",
    verifyIntroEmail: "لحماية معلوماتك، سنرسل رمزًا من 6 أرقام إلى بريدك الإلكتروني",
    sendCode: "إرسال الرمز", sending: "جارٍ الإرسال…", codeSent: "أرسلنا رمزًا إلى", resend: "إعادة إرسال الرمز",
    codeLabel: "أدخل الرمز المكوّن من 6 أرقام", codePlaceholder: "______", verify: "تحقّق", verifying: "جارٍ التحقق…",
    accept: "قبول العرض", decline: "رفض", requestRevision: "طلب تعديلات",
    commentLabel: "أضف ملاحظة (اختياري)", deciding: "جارٍ الإرسال…",
    acceptedTitle: "شكرًا لك — لقد قبلت العرض", acceptedMsg: "أرسلنا دعوة لتفعيل حسابك ومتابعة رحلتك.",
    declinedTitle: "تم تسجيل ردك", declinedMsg: "لقد رفضت هذا العرض. لست بحاجة إلى حساب. يبقى منسّق حالتك متاحًا إذا تغيّر أي شيء.",
    revisionTitle: "تم إرسال طلبك", revisionMsg: "سيقوم منسّق حالتك بإعداد عرض معدّل وإرسال رابط آمن جديد إليك.",
    invalid: "رابط العرض غير صالح أو منتهي الصلاحية.", error: "تعذر إكمال الطلب.",
    tooMany: "طلبات كثيرة جدًا. يُرجى المحاولة لاحقًا.", loading: "جارٍ التحميل…", decidedAlready: "تم بالفعل تسجيل قرار لهذا العرض.",
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
      if (full.decided) { setError(t.decidedAlready); }
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

  const total = proposal ? proposal.items.filter((i) => !i.optional).reduce((sum, i) => sum + i.quantity * i.unitPrice, 0) : 0;
  const money = (n: number) => new Intl.NumberFormat(locale, { style: "currency", currency: proposal?.currency ?? "USD" }).format(n);
  const doneCopy = outcome === "ACCEPTED" ? { title: t.acceptedTitle, msg: t.acceptedMsg } : outcome === "DECLINED" ? { title: t.declinedTitle, msg: t.declinedMsg } : { title: t.revisionTitle, msg: t.revisionMsg };

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
            <p className="eyebrow">RehletShifaa · {proposal.caseNumber}</p>
            <h1 className="headline mt-2">{t.title}</h1>
            <p className="mt-2 text-ink-600">{t.greeting} <strong>{proposal.patientName}</strong></p>
            {proposal.recommendedTreatment && <div className="mt-6"><p className="text-sm font-bold text-brand-700">{t.treatmentLabel}</p><p className="mt-1 whitespace-pre-line text-ink-700">{proposal.recommendedTreatment}</p></div>}
            {proposal.risksAndLimitations && <div className="mt-4"><p className="text-sm font-bold text-brand-700">{t.risksLabel}</p><p className="mt-1 whitespace-pre-line text-ink-700">{proposal.risksAndLimitations}</p></div>}
            <p className="mt-6 text-sm font-bold text-brand-700">{t.servicesLabel}</p>
            <ul className="mt-2 divide-y divide-line">
              {proposal.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-4 py-3">
                  <span>{item.description}{item.optional ? " (optional)" : ""}</span>
                  <span className="font-bold">{money(item.quantity * item.unitPrice)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-between border-t border-line pt-4 text-lg font-bold">
              <span>{t.total}</span><span>{money(total)}</span>
            </div>
            {proposal.notes && <div className="mt-6 rounded-xl bg-mist p-4"><p className="text-sm font-bold text-brand-700">{t.notesLabel}</p><p className="mt-1 whitespace-pre-line text-ink-700">{proposal.notes}</p></div>}
            {proposal.validUntil && <p className="mt-2 text-sm text-ink-500">{t.validUntil} {new Intl.DateTimeFormat(locale).format(new Date(proposal.validUntil))}</p>}

            {proposal.decided ? (
              <p role="alert" className="mt-6 rounded-xl bg-mist p-4 text-ink-700">{t.decidedAlready}</p>
            ) : (
              <>
                <label className="mt-8 block text-sm font-bold">{t.commentLabel}
                  <textarea className="field mt-2" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
                </label>
                {error && <p role="alert" className="mt-4 rounded-xl bg-alert-50 p-3 text-alert-800">{error}</p>}
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <button className="btn-primary" disabled={busy} onClick={() => void decide("ACCEPTED")}>{busy ? t.deciding : t.accept}</button>
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
