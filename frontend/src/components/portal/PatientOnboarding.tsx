"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";

// Mirrors the backend-computed DTOs. Readiness is rendered verbatim — the UI never infers readiness
// from unrelated case/proposal statuses. No provider cost, margin, profit or finance reason is exposed.
type BlockingItem = { code: string; labelEn: string; labelAr: string };
type Readiness = {
  accountActivated: boolean; contactVerified: boolean; verifiedChannel?: string | null;
  identityRequired: boolean; identityVerified: boolean; onboardingCompleted: boolean;
  requiredConsentsCompleted: boolean; representativeAuthorizationValid: boolean;
  depositRequired: boolean; depositStatus: string; depositSatisfied: boolean;
  blockingItems: BlockingItem[]; readyForCoordination: boolean; updatedAt: string;
};
type Identity = { id: string; subjectType: string; status: string; documentType?: string; issuingCountry?: string; documentReferenceMasked?: string; rejectionReason?: string } | null;
type Onboarding = {
  id: string; caseId: string; caseNumber: string; state: string; subjectType?: string | null;
  version: number; readiness: Readiness; identity: Identity; completedConsentTypes: string[]; requiredConsentTypes: string[];
};

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

const copy = {
  en: {
    title: "Complete your onboarding", subtitle: "A few secure steps before we begin coordinating your care.",
    progress: "Progress", ready: "You're ready — your coordinator can begin arranging your care.",
    stepSubject: "Who is completing this?", subjectPatient: "I am the patient", subjectGuardian: "Parent / legal guardian", subjectRep: "Authorized representative", subjectPayer: "I am paying only",
    relationship: "Relationship (e.g. parent, spouse)", save: "Save", saving: "Saving…",
    stepContact: "Verified contact", contactDone: "Verified via", contactTodo: "Open the secure link we sent you and enter the code to verify a contact channel.",
    stepIdentity: "Identity verification", identityIntro: "Confirm the patient or representative identity. Only the minimum information is stored and it is encrypted.",
    legalName: "Full legal name (as on your ID)", dob: "Date of birth", nationality: "Nationality", docType: "Document type", issuingCountry: "Issuing country", docRef: "Document number",
    submitIdentity: "Submit for verification", identityPending: "Submitted — awaiting review.", identityReview: "Under review by our team.", identityVerified: "Identity verified.", identityRejected: "Not verified. Please resubmit.",
    stepConsents: "Consents", consentIntro: "Please review and agree to the following to proceed.", agree: "I agree", consentSaved: "Recorded",
    stepDeposit: "Coordination deposit", depositNone: "No deposit is required.", depositPaid: "Paid — thank you.", depositWaived: "Waived by our finance team.", depositDue: "A coordination deposit is due. Your coordinator will confirm how to pay it.",
    review: "Review & submit", reviewIntro: "When every step above is complete you can submit your onboarding.", submit: "Submit onboarding", submitting: "Submitting…",
    doneTitle: "Onboarding complete", doneMsg: "Thank you — you are now ready for care coordination.",
    error: "The request could not be completed.", loading: "Loading…",
    consents: { PRIVACY_DATA_PROCESSING: "Privacy & data-processing notice", CROSS_BORDER_CARE: "Cross-border care coordination", DEPOSIT_CANCELLATION_TERMS: "Deposit, cancellation & refund terms", REPRESENTATIVE_AUTHORIZATION: "Representative authorization", MEDICAL_INFORMATION_SHARING: "Medical-information sharing", TELECONSULTATION: "Teleconsultation" } as Record<string, string>,
  },
  ar: {
    title: "أكمل تسجيلك", subtitle: "بضع خطوات آمنة قبل أن نبدأ تنسيق رعايتك.",
    progress: "التقدّم", ready: "أنت جاهز — يمكن لمنسّقك بدء ترتيب رعايتك.",
    stepSubject: "من يكمل هذه الخطوات؟", subjectPatient: "أنا المريض", subjectGuardian: "أحد الوالدين / الوصي القانوني", subjectRep: "ممثل مفوّض", subjectPayer: "أقوم بالدفع فقط",
    relationship: "صلة القرابة (مثال: والد، زوج)", save: "حفظ", saving: "جارٍ الحفظ…",
    stepContact: "التواصل المُوثّق", contactDone: "تم التوثيق عبر", contactTodo: "افتح الرابط الآمن الذي أرسلناه وأدخل الرمز لتوثيق وسيلة تواصل.",
    stepIdentity: "التحقق من الهوية", identityIntro: "أكّد هوية المريض أو الممثل. نُخزّن الحد الأدنى من المعلومات فقط ومشفّرة.",
    legalName: "الاسم القانوني الكامل (كما في الهوية)", dob: "تاريخ الميلاد", nationality: "الجنسية", docType: "نوع المستند", issuingCountry: "بلد الإصدار", docRef: "رقم المستند",
    submitIdentity: "إرسال للتحقق", identityPending: "تم الإرسال — بانتظار المراجعة.", identityReview: "قيد المراجعة من فريقنا.", identityVerified: "تم التحقق من الهوية.", identityRejected: "لم يتم التحقق. يُرجى إعادة الإرسال.",
    stepConsents: "الموافقات", consentIntro: "يُرجى مراجعة الموافقة على ما يلي للمتابعة.", agree: "أوافق", consentSaved: "مسجّلة",
    stepDeposit: "وديعة التنسيق", depositNone: "لا تُطلب وديعة.", depositPaid: "تم الدفع — شكرًا لك.", depositWaived: "أُعفيت من قِبل فريق المالية.", depositDue: "توجد وديعة تنسيق مستحقة. سيؤكد منسّقك طريقة الدفع.",
    review: "المراجعة والإرسال", reviewIntro: "عند اكتمال كل الخطوات أعلاه يمكنك إرسال تسجيلك.", submit: "إرسال التسجيل", submitting: "جارٍ الإرسال…",
    doneTitle: "اكتمل التسجيل", doneMsg: "شكرًا لك — أنت الآن جاهز لتنسيق الرعاية.",
    error: "تعذّر إكمال الطلب.", loading: "جارٍ التحميل…",
    consents: { PRIVACY_DATA_PROCESSING: "إشعار الخصوصية ومعالجة البيانات", CROSS_BORDER_CARE: "تنسيق الرعاية عبر الحدود", DEPOSIT_CANCELLATION_TERMS: "شروط الوديعة والإلغاء والاسترداد", REPRESENTATIVE_AUTHORIZATION: "تفويض الممثل", MEDICAL_INFORMATION_SHARING: "مشاركة المعلومات الطبية", TELECONSULTATION: "الاستشارة عن بُعد" } as Record<string, string>,
  },
};

export function PatientOnboarding({ caseId, locale }: { caseId: string; locale: Locale }) {
  const t = copy[locale];
  const { user } = useAuth();
  const [data, setData] = useState<Onboarding | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [subject, setSubject] = useState("PATIENT");
  const [relationship, setRelationship] = useState("");
  const [idForm, setIdForm] = useState({ legalName: "", dateOfBirth: "", nationality: "", documentType: "PASSPORT", issuingCountry: "", documentReference: "" });

  const api = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    if (!user) throw new Error("AUTHENTICATION_REQUIRED");
    const res = await fetch(`${API}/api/v1${path}`, { ...init, headers: { Authorization: `Bearer ${user.access_token}`, ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers }, cache: "no-store" });
    if (!res.ok) { const body = (await res.json().catch(() => ({}))) as { message?: string }; throw new Error(body.message ?? t.error); }
    return (res.status === 204 ? undefined : res.json()) as T;
  }, [user, t.error]);

  const load = useCallback(() => {
    api<Onboarding>(`/patient/cases/${caseId}/onboarding`).then((d) => { setData(d); if (d.subjectType) setSubject(d.subjectType); }).catch((e) => setError(e instanceof Error ? e.message : t.error));
  }, [api, caseId, t.error]);
  useEffect(() => { load(); }, [load]);

  async function run(fn: () => Promise<unknown>) { setBusy(true); setError(""); try { await fn(); load(); } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); } }

  if (!data) return <div className="card p-6" aria-live="polite">{error ? <span className="text-alert-800">{error}</span> : t.loading}</div>;
  const r = data.readiness;
  const steps: Array<[string, boolean]> = [
    [t.stepSubject, !!data.subjectType], [t.stepContact, r.contactVerified], [t.stepIdentity, !r.identityRequired || r.identityVerified],
    [t.stepConsents, r.requiredConsentsCompleted], [t.stepDeposit, r.depositSatisfied], [t.review, r.onboardingCompleted],
  ];
  const doneCount = steps.filter(([, ok]) => ok).length;
  const identityStatus = data.identity?.status;

  return (
    <section className="card p-6 sm:p-8" aria-label={t.title}>
      <p className="eyebrow">{data.caseNumber}</p>
      <h2 className="headline mt-2">{t.title}</h2>
      <p className="mt-2 text-ink-600">{t.subtitle}</p>

      {/* progress */}
      <div className="mt-5">
        <div className="flex items-center justify-between text-sm font-bold text-ink-700"><span>{t.progress}</span><span>{doneCount}/{steps.length}</span></div>
        <div role="progressbar" aria-label={t.progress} aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount} className="mt-2 h-2 w-full overflow-hidden rounded-full bg-mist"><div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
        <ol className="mt-4 grid gap-2 sm:grid-cols-2">{steps.map(([label, ok]) => (
          <li key={label} className="flex items-center gap-2 text-sm"><span aria-hidden className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-bold ${ok ? "bg-brand-600 text-white" : "bg-mist text-ink-500"}`}>{ok ? "✓" : "•"}</span><span className={ok ? "text-ink-500 line-through" : "font-semibold text-ink-800"}>{label}</span></li>
        ))}</ol>
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl bg-alert-50 p-3 text-alert-800">{error}</p>}

      {r.readyForCoordination ? (
        <div className="mt-6 rounded-xl bg-brand-50 p-5"><h3 className="title text-brand-800">{t.doneTitle}</h3><p className="mt-1 text-ink-700">{t.doneMsg}</p></div>
      ) : (
        <div className="mt-6 space-y-6">
          {/* 1. subject */}
          <fieldset className="rounded-xl border border-line p-4"><legend className="px-1 text-sm font-bold text-brand-700">{t.stepSubject}</legend>
            <div className="grid gap-2 sm:grid-cols-2">{([["PATIENT", t.subjectPatient], ["GUARDIAN", t.subjectGuardian], ["REPRESENTATIVE", t.subjectRep], ["PAYER", t.subjectPayer]] as const).map(([v, l]) => (
              <label key={v} className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm ${subject === v ? "border-brand-500 bg-brand-50" : "border-line"}`}><input type="radio" name="subject" className="accent-brand-600" checked={subject === v} onChange={() => setSubject(v)} /><span>{l}</span></label>
            ))}</div>
            {(subject === "GUARDIAN" || subject === "REPRESENTATIVE") && <input className="field mt-3" placeholder={t.relationship} value={relationship} onChange={(e) => setRelationship(e.target.value)} aria-label={t.relationship} />}
            <button className="btn-secondary mt-3" disabled={busy} onClick={() => void run(() => api(`/patient/cases/${caseId}/onboarding/subject`, { method: "PUT", body: JSON.stringify({ subjectType: subject, relationship: relationship || undefined, expectedVersion: data.version }) }))}>{busy ? t.saving : t.save}</button>
          </fieldset>

          {/* 2. contact */}
          <div className="rounded-xl border border-line p-4"><p className="text-sm font-bold text-brand-700">{t.stepContact}</p>
            {r.contactVerified ? <p className="mt-1 text-ink-700">{t.contactDone} <strong>{r.verifiedChannel}</strong></p> : <p className="mt-1 text-ink-600">{t.contactTodo}</p>}
          </div>

          {/* 3. identity */}
          {r.identityRequired && <fieldset className="rounded-xl border border-line p-4"><legend className="px-1 text-sm font-bold text-brand-700">{t.stepIdentity}</legend>
            {r.identityVerified ? <p className="text-brand-800">{t.identityVerified}</p> : (
              <>
                <p className="text-sm text-ink-600">{t.identityIntro}</p>
                {identityStatus === "PENDING" && <p className="mt-2 rounded-lg bg-mist p-2 text-sm">{t.identityPending}</p>}
                {identityStatus === "MANUAL_REVIEW" && <p className="mt-2 rounded-lg bg-mist p-2 text-sm">{t.identityReview}</p>}
                {identityStatus === "REJECTED" && <p className="mt-2 rounded-lg bg-alert-50 p-2 text-sm text-alert-800">{t.identityRejected}{data.identity?.rejectionReason ? ` — ${data.identity.rejectionReason}` : ""}</p>}
                {!["PENDING", "MANUAL_REVIEW"].includes(identityStatus ?? "") && <><div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input className="field" placeholder={t.legalName} value={idForm.legalName} onChange={(e) => setIdForm({ ...idForm, legalName: e.target.value })} aria-label={t.legalName} />
                  <input className="field" type="date" value={idForm.dateOfBirth} onChange={(e) => setIdForm({ ...idForm, dateOfBirth: e.target.value })} aria-label={t.dob} />
                  <input className="field" placeholder={t.nationality} value={idForm.nationality} onChange={(e) => setIdForm({ ...idForm, nationality: e.target.value })} aria-label={t.nationality} />
                  <select className="field" value={idForm.documentType} onChange={(e) => setIdForm({ ...idForm, documentType: e.target.value })} aria-label={t.docType}><option value="PASSPORT">{locale === "ar" ? "جواز سفر" : "Passport"}</option><option value="NATIONAL_ID">{locale === "ar" ? "هوية وطنية" : "National ID"}</option></select>
                  <input className="field" placeholder={t.issuingCountry} value={idForm.issuingCountry} onChange={(e) => setIdForm({ ...idForm, issuingCountry: e.target.value })} aria-label={t.issuingCountry} />
                  <input className="field" placeholder={t.docRef} value={idForm.documentReference} onChange={(e) => setIdForm({ ...idForm, documentReference: e.target.value })} aria-label={t.docRef} />
                </div>
                <button className="btn-secondary mt-3" disabled={busy || !idForm.legalName.trim()} onClick={() => void run(() => api(`/patient/cases/${caseId}/identity`, { method: "POST", body: JSON.stringify({ subjectType: subject === "PATIENT" ? "PATIENT" : "REPRESENTATIVE", representativeRelationship: relationship || undefined, method: "DOCUMENT", legalName: idForm.legalName, dateOfBirth: idForm.dateOfBirth || undefined, nationality: idForm.nationality || undefined, documentType: idForm.documentType, issuingCountry: idForm.issuingCountry || undefined, documentReference: idForm.documentReference || undefined }) }))}>{busy ? t.saving : t.submitIdentity}</button>
                </>}
              </>
            )}
          </fieldset>}

          {/* 4. consents */}
          <fieldset className="rounded-xl border border-line p-4"><legend className="px-1 text-sm font-bold text-brand-700">{t.stepConsents}</legend>
            <p className="text-sm text-ink-600">{t.consentIntro}</p>
            <div className="mt-3 space-y-2">{data.requiredConsentTypes.map((type) => {
              const done = data.completedConsentTypes.includes(type);
              return <div key={type} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3">
                <span className="text-sm">{t.consents[type] ?? type}</span>
                {done ? <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">✓ {t.consentSaved}</span>
                  : <button className="btn-secondary !py-1 text-sm" disabled={busy} onClick={() => void run(() => api(`/patient/cases/${caseId}/onboarding/consents`, { method: "POST", body: JSON.stringify({ consentType: type, exactText: `${t.consents[type] ?? type} — ${locale === "ar" ? "أوافق" : "I agree"}`, policyVersion: "v1", language: locale }) }))}>{t.agree}</button>}
              </div>;
            })}</div>
          </fieldset>

          {/* 5. deposit */}
          <div className="rounded-xl border border-line p-4"><p className="text-sm font-bold text-brand-700">{t.stepDeposit}</p>
            <p className="mt-1 text-ink-700">{r.depositStatus === "WAIVED" ? t.depositWaived : r.depositStatus === "PAID" ? t.depositPaid : !r.depositRequired ? t.depositNone : t.depositDue}</p>
          </div>

          {/* 6. review & submit */}
          <div className="rounded-xl border border-brand-200 bg-brand-50 p-4"><p className="text-sm font-bold text-brand-800">{t.review}</p><p className="mt-1 text-sm text-ink-600">{t.reviewIntro}</p>
            <button className="btn-primary mt-3 w-full sm:w-auto" disabled={busy || !steps.slice(0, 5).every(([, ok]) => ok)} onClick={() => void run(() => api(`/patient/cases/${caseId}/onboarding/submit`, { method: "POST", body: JSON.stringify({ expectedVersion: data.version }) }))}>{busy ? t.submitting : t.submit}</button>
          </div>
        </div>
      )}
    </section>
  );
}
