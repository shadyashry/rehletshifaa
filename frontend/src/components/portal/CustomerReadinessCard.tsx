"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";

// Coordinator-facing, read-only readiness summary. It shows the current blocking step, the responsible
// party and a safe next action, but exposes NO internal notes, provider prices, margin, finance reasons,
// identity data or audit records — and a coordinator can never mark identity/onboarding/payment from here.
type BlockingItem = { code: string; labelEn: string; labelAr: string };
type Readiness = {
  accountActivated: boolean; contactVerified: boolean; verifiedChannel?: string | null;
  identityRequired: boolean; identityVerified: boolean; onboardingCompleted: boolean;
  requiredConsentsCompleted: boolean; representativeAuthorizationValid: boolean;
  depositRequired: boolean; depositStatus: string; depositSatisfied: boolean;
  blockingItems: BlockingItem[]; readyForCoordination: boolean; updatedAt: string;
};

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

const copy = {
  en: { title: "Customer readiness", ready: "Ready for chargeable coordination", notReady: "Not yet ready — patient action pending", currentStep: "Current step", responsible: "Responsible", party: "Patient / representative", lastUpdate: "Last update", blocking: "Outstanding", deposit: "Deposit", none: "All steps complete.", nextAction: "Safe next action", nextSupport: "You can monitor progress and message the patient for missing information. Identity, consent, payment and completion are done by the patient or the authorized team.", loading: "Loading readiness…", error: "Readiness is unavailable.", identity: "Identity verification", idVerified: "Verified", idPending: "Pending review", idNotRequired: "Not required" },
  ar: { title: "جاهزية العميل", ready: "جاهز للتنسيق المدفوع", notReady: "غير جاهز بعد — بانتظار إجراء المريض", currentStep: "الخطوة الحالية", responsible: "المسؤول", party: "المريض / الممثل", lastUpdate: "آخر تحديث", blocking: "المتبقّي", deposit: "الوديعة", none: "اكتملت كل الخطوات.", nextAction: "الإجراء الآمن التالي", nextSupport: "يمكنك متابعة التقدّم ومراسلة المريض لطلب المعلومات الناقصة. أما الهوية والموافقات والدفع والإكمال فيتمّها المريض أو الفريق المفوّض.", loading: "جارٍ تحميل الجاهزية…", error: "الجاهزية غير متاحة.", identity: "التحقق من الهوية", idVerified: "تم التحقق", idPending: "بانتظار المراجعة", idNotRequired: "غير مطلوب" },
};

export function CustomerReadinessCard({ caseId, role, locale }: { caseId: string; role: string; locale: Locale }) {
  const t = copy[locale];
  const { user } = useAuth();
  const [r, setR] = useState<Readiness | null>(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(() => {
    if (!user) return;
    setMissing(false);
    fetch(`${API}/api/v1/${role}/cases/${caseId}/readiness`, { headers: { Authorization: `Bearer ${user.access_token}` }, cache: "no-store" })
      .then((res) => { if (!res.ok) throw new Error(); return res.json() as Promise<Readiness>; })
      .then(setR).catch(() => setMissing(true));
  }, [user, role, caseId]);
  useEffect(() => { load(); }, [load]);

  if (missing) return <p role="alert" className="text-sm text-alert-800">{t.error} <button className="link-cta" onClick={load}>{locale === "ar" ? "إعادة المحاولة" : "Retry"}</button></p>;
  if (!r) return <p className="text-sm text-ink-500">{t.loading}</p>;
  const label = (b: BlockingItem) => (locale === "ar" ? b.labelAr : b.labelEn);
  const current = r.blockingItems[0];

  return (
    <div className="mt-4 rounded-xl border border-line p-4" aria-label={t.title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-brand-700">{t.title}</p>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${r.readyForCoordination ? "bg-brand-600 text-white" : "bg-alert-50 text-alert-800"}`}>{r.readyForCoordination ? t.ready : t.notReady}</span>
      </div>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <div><dt className="text-xs uppercase tracking-wide text-ink-500">{t.currentStep}</dt><dd className="font-semibold text-ink-900">{current ? label(current) : t.none}</dd></div>
        <div><dt className="text-xs uppercase tracking-wide text-ink-500">{t.responsible}</dt><dd className="font-semibold text-ink-900">{t.party}</dd></div>
        <div><dt className="text-xs uppercase tracking-wide text-ink-500">{t.deposit}</dt><dd className="font-semibold text-ink-900">{r.depositStatus}</dd></div>
        <div><dt className="text-xs uppercase tracking-wide text-ink-500">{t.identity}</dt><dd className={`font-semibold ${!r.identityRequired ? "text-ink-600" : r.identityVerified ? "text-brand-700" : "text-alert-800"}`}>{!r.identityRequired ? t.idNotRequired : r.identityVerified ? t.idVerified : t.idPending}</dd></div>
        <div><dt className="text-xs uppercase tracking-wide text-ink-500">{t.lastUpdate}</dt><dd className="font-semibold text-ink-900">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(r.updatedAt))}</dd></div>
      </dl>
      {r.blockingItems.length > 0 && (
        <div className="mt-3"><p className="text-xs uppercase tracking-wide text-ink-500">{t.blocking}</p>
          <ul className="mt-1 flex flex-wrap gap-2">{r.blockingItems.map((b) => <li key={b.code} className="rounded-full bg-mist px-3 py-1 text-xs font-semibold text-ink-700">{label(b)}</li>)}</ul>
        </div>
      )}
      <p className="mt-3 text-xs text-ink-500"><span className="font-bold text-ink-600">{t.nextAction}:</span> {t.nextSupport}</p>
    </div>
  );
}
