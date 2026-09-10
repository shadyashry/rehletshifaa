"use client";

import { useState } from "react";
import { FileText } from "lucide-react";

import type { Locale } from "@/lib/i18n";

export type CatalogService = { id: string; serviceCode: string; serviceName: string; category?: string; priceEgp: number; active: boolean };
export type FxRate = { currency: string; rate: number; rateDate: string; source: string };
export type ReviewDocument = { documentId: string; fileName: string; status: string };
export type DraftEstimate = { serviceDescription: string; estimatedCost: number; currency: string; catalogServiceId?: string | null };
export type ReviewDraft = { id: string; recommendedTreatment?: string | null; risksAndLimitations?: string | null; costEstimates?: DraftEstimate[]; proposalCurrency?: string | null } | null;
type Mutate = (path: string, body?: unknown, method?: string) => Promise<unknown>;

const BASE = "EGP";

/** Only the outcomes the domain actually accepts, in the order a consultant would consider them. */
const OUTCOMES = ["INFO", "REASSIGN", "RETURN_TO_COORDINATOR", "NOT_SUITABLE"] as const;
type Outcome = (typeof OUTCOMES)[number];

const CURRENCY_LABELS: Record<string, string> = {
  EGP: "EGP", USD: "USD", EUR: "EUR", AED: "AED", SAR: "SAR", GBP: "GBP", KWD: "KWD", QAR: "QAR", JOD: "JOD",
};

function money(amount: number, currency: string, locale: Locale) {
  try { return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount); }
  catch { return `${amount.toLocaleString(locale)} ${currency}`; }
}

/**
 * The consultant's clinical review: read the evidence, record the recommendation, pick the recommended
 * services from the approved price list, then submit.
 *
 * <p>Two deliberate constraints. Clinical content outranks commercial content visually. And there is one
 * normal completion — Submit recommendation — which the backend turns into a coordinator handoff by
 * itself; the exceptional outcomes stay behind a single disclosure so they never compete with it.
 */
export function ClinicalReviewPanel({ locale, caseId, busy, catalog, fxRates, documents, draft, viewDoc, downloadDoc, mutate }: {
  locale: Locale; caseId: string; busy: boolean; catalog: CatalogService[]; fxRates: FxRate[];
  documents: ReviewDocument[]; draft?: ReviewDraft; viewDoc: (id: string) => void; downloadDoc: (id: string) => void; mutate: Mutate;
}) {
  const ar = locale === "ar";
  const t = copy(ar);

  // Resume an existing draft, and re-seed when the consultant switches case. A sync key beats an effect:
  // the values are derived from props, never fetched again.
  const seedKey = `${caseId}|${draft?.id ?? ""}`;
  const [synced, setSynced] = useState(seedKey);
  const [recommendation, setRecommendation] = useState(draft?.recommendedTreatment ?? "");
  const [considerations, setConsiderations] = useState(draft?.risksAndLimitations ?? "");
  const [selected, setSelected] = useState<Set<string>>(() => seedSelection(draft, catalog));
  const [offList, setOffList] = useState<{ description: string; amountEgp: number }[]>(() => seedOffList(draft));
  const [proposalCurrency, setProposalCurrency] = useState(draft?.proposalCurrency ?? BASE);
  if (synced !== seedKey) {
    setSynced(seedKey);
    setRecommendation(draft?.recommendedTreatment ?? "");
    setConsiderations(draft?.risksAndLimitations ?? "");
    setSelected(seedSelection(draft, catalog));
    setOffList(seedOffList(draft));
    setProposalCurrency(draft?.proposalCurrency ?? BASE);
  }

  const [offName, setOffName] = useState("");
  const [offAmount, setOffAmount] = useState("");
  const [outcome, setOutcome] = useState<Outcome | "">("");
  const [outcomeReason, setOutcomeReason] = useState("");
  const [error, setError] = useState("");

  const rate = proposalCurrency === BASE ? 1 : (fxRates.find(fx => fx.currency === proposalCurrency)?.rate ?? 1);
  const converted = proposalCurrency !== BASE && rate !== 1;
  const currencies = [BASE, ...fxRates.filter(fx => fx.currency !== BASE).map(fx => fx.currency)];

  const picks = catalog.filter(service => selected.has(service.id));
  const baseTotal = picks.reduce((sum, s) => sum + s.priceEgp, 0) + offList.reduce((sum, row) => sum + row.amountEgp, 0);
  const serviceCount = picks.length + offList.length;
  const readyDocuments = documents.filter(doc => doc.status === "CLEAN");
  const canSubmit = recommendation.trim().length > 0 && serviceCount > 0;

  const toggle = (id: string) => setSelected(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const estimates = () => [
    // Catalogue picks always travel at their approved EGP price. The display currency is a lens, never a
    // value the server should trust — and the server re-reads the catalogue price regardless.
    ...picks.map(s => ({ serviceDescription: s.serviceName, estimatedCost: s.priceEgp, currency: BASE, catalogServiceId: s.id })),
    ...offList.map(row => ({ serviceDescription: row.description, estimatedCost: row.amountEgp, currency: BASE })),
  ];

  const submit = () => {
    if (!canSubmit) { setError(recommendation.trim() ? t.errServices : t.errRecommendation); return; }
    setError("");
    void mutate(`/doctor/cases/${caseId}/review-decision`, {
      decision: "ACCEPT", recommendedTreatment: recommendation.trim(), proposalCurrency,
      risksAndLimitations: considerations.trim() || undefined, costEstimates: estimates(),
    });
  };

  const saveDraft = () => {
    if (!recommendation.trim() && serviceCount === 0) { setError(t.errDraft); return; }
    setError("");
    void mutate(`/doctor/cases/${caseId}/reviews`, {
      suitability: "SUITABLE", recommendedTreatment: recommendation.trim() || undefined, proposalCurrency,
      risksAndLimitations: considerations.trim() || undefined, costEstimates: estimates(),
    });
  };

  const submitOutcome = () => {
    if (!outcome) return;
    if (!outcomeReason.trim()) { setError(t.errReason); return; }
    setError("");
    void mutate(`/doctor/cases/${caseId}/review-decision`, {
      decision: outcome, risksAndLimitations: outcomeReason.trim(),
    }).then(result => { if (result) { setOutcome(""); setOutcomeReason(""); } });
  };

  const addOffList = () => {
    const amount = Number(offAmount);
    if (!offName.trim() || !Number.isFinite(amount) || amount <= 0) { setError(t.errOffList); return; }
    setError("");
    setOffList(rows => [...rows, { description: offName.trim(), amountEgp: Math.round(amount * 100) / 100 }]);
    setOffName(""); setOffAmount("");
  };

  return (
    <section aria-labelledby="clinical-review-title" className="card p-4 sm:p-5">
      <h3 id="clinical-review-title" className="text-[1.05rem] font-bold leading-6 text-brand-900">{t.title}</h3>

      {/* Evidence first: composing a recommendation should never mean leaving the page to find a file. */}
      <section aria-labelledby="review-documents" className="mt-4 rounded-lg border border-line bg-mist p-3">
        <h4 id="review-documents" className="text-[0.7rem] font-bold uppercase tracking-[0.08em] text-ink-500">
          {t.documents}{documents.length > 0 && <span className="text-ink-400"> · {documents.length}</span>}
        </h4>
        {documents.length === 0
          ? <p className="mt-1.5 text-[0.85rem] text-ink-500">{t.noDocuments}</p>
          : <ul className="mt-1">
              {documents.map(doc => (
                <li key={doc.documentId} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-1.5 last:border-0">
                  <FileText size={14} aria-hidden className="flex-none text-brand-600"/>
                  <span className="min-w-0 flex-1 truncate text-[0.88rem] font-semibold text-ink-800">{doc.fileName}</span>
                  {doc.status === "CLEAN"
                    ? <span className="flex gap-3">
                        <button type="button" className="link-cta text-[0.85rem]" onClick={() => viewDoc(doc.documentId)}>{t.preview}</button>
                        <button type="button" className="link-cta text-[0.85rem]" onClick={() => downloadDoc(doc.documentId)}>{t.download}</button>
                      </span>
                    : <span className="text-[0.8rem] text-ink-500">{doc.status === "PENDING" || doc.status === "UPLOADED" ? t.scanning : t.unavailable}</span>}
                </li>
              ))}
            </ul>}
      </section>

      <div className="mt-5">
        <label htmlFor="clinical-recommendation" className="block text-[0.95rem] font-bold text-ink-900">{t.recommendation}</label>
        <p id="clinical-recommendation-hint" className="mt-0.5 text-[0.85rem] leading-6 text-ink-600">{t.recommendationHint}</p>
        <textarea id="clinical-recommendation" className="field mt-2 min-h-32" maxLength={20000} value={recommendation}
                  aria-describedby="clinical-recommendation-hint" aria-required="true"
                  onChange={event => setRecommendation(event.target.value)} placeholder={t.recommendationPlaceholder}/>
      </div>

      <section aria-labelledby="recommended-services" className="mt-5 rounded-xl border border-line p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 id="recommended-services" className="text-[0.95rem] font-bold text-ink-900">{t.services}</h4>
            <p className="mt-0.5 max-w-xl text-[0.85rem] leading-6 text-ink-600">{t.servicesHint}</p>
          </div>
          <div className="flex-none">
            <label className="flex items-center justify-end gap-2 text-[0.82rem] font-semibold text-ink-600">
              {t.proposalCurrency}
              <select className="field !mt-0 w-auto py-1" value={proposalCurrency} onChange={event => setProposalCurrency(event.target.value)}
                      aria-describedby="proposal-currency-hint">
                {currencies.map(code => <option key={code} value={code}>{CURRENCY_LABELS[code] ?? code}</option>)}
              </select>
            </label>
            <p id="proposal-currency-hint" className="mt-1 max-w-xs text-[0.78rem] leading-5 text-ink-500">{t.currencyHint}</p>
          </div>
        </div>

        {catalog.length === 0
          ? <p className="mt-3 rounded-lg bg-mist p-3 text-[0.85rem] text-ink-600">{t.noCatalog}</p>
          : <ul className="mt-3 space-y-1">
              {catalog.map(service => {
                const on = selected.has(service.id);
                return (
                  <li key={service.id}>
                    <label className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 transition ${on ? "border-brand-500 bg-brand-50" : "border-line hover:border-brand-300"}`}>
                      <input type="checkbox" className="h-4 w-4 flex-none accent-brand-600" checked={on} onChange={() => toggle(service.id)}/>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.9rem] font-semibold text-ink-900">{service.serviceName}</span>
                        {service.category && <span className="block text-[0.78rem] text-ink-500">{service.category}</span>}
                      </span>
                      <span className="flex-none text-end">
                        <span className="block whitespace-nowrap text-[0.9rem] font-bold text-ink-800">{money(service.priceEgp, BASE, locale)}</span>
                        {converted && <span className="block whitespace-nowrap text-[0.75rem] text-ink-500">≈ {money(service.priceEgp * rate, proposalCurrency, locale)}</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>}

        {offList.length > 0 && (
          <ul className="mt-2 space-y-1">
            {offList.map((row, index) => (
              <li key={`${row.description}-${index}`} className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9rem] font-semibold text-ink-900">{row.description}</span>
                  <span className="block text-[0.75rem] font-bold text-amber-900">{t.needsFinance}</span>
                </span>
                <span className="flex-none whitespace-nowrap text-[0.9rem] font-bold text-ink-800">{money(row.amountEgp, BASE, locale)}</span>
                <button type="button" className="flex-none text-[0.8rem] font-bold text-ink-500 hover:text-alert-700"
                        onClick={() => setOffList(rows => rows.filter((_, i) => i !== index))}
                        aria-label={`${t.removeService}: ${row.description}`}>×</button>
              </li>
            ))}
          </ul>
        )}

        {/* The exception path, collapsed: outside the approved list means Finance has to price it. */}
        <details className="mt-3 rounded-lg border border-line px-3 py-2">
          <summary className="cursor-pointer text-[0.85rem] font-semibold text-brand-800">+ {t.offListToggle}</summary>
          <div className="mt-3 space-y-2">
            <p className="text-[0.8rem] leading-6 text-ink-600">{t.offListHint}</p>
            <label className="block text-[0.8rem] font-bold text-ink-700">{t.offListName}
              <input className="field mt-1" value={offName} maxLength={500} onChange={event => setOffName(event.target.value)}/>
            </label>
            <label className="block text-[0.8rem] font-bold text-ink-700">{t.offListAmount}
              <input className="field mt-1" type="number" min="0" step="0.01" value={offAmount} onChange={event => setOffAmount(event.target.value)}/>
            </label>
            <button type="button" className="btn-secondary" onClick={addOffList}>{t.offListAdd}</button>
          </div>
        </details>
      </section>

      <div className="mt-5">
        <label htmlFor="clinical-considerations" className="block text-[0.95rem] font-bold text-ink-900">{t.considerations}</label>
        <p id="clinical-considerations-hint" className="mt-0.5 text-[0.85rem] leading-6 text-ink-600">{t.considerationsHint}</p>
        <textarea id="clinical-considerations" className="field mt-2 min-h-24" maxLength={20000} value={considerations}
                  aria-describedby="clinical-considerations-hint"
                  onChange={event => setConsiderations(event.target.value)}/>
      </div>

      {/* A last read-through before it leaves the consultant's hands — not another page, not another click. */}
      <section aria-labelledby="recommendation-summary" className="mt-5 rounded-xl border border-brand-200 bg-brand-50 p-4">
        <h4 id="recommendation-summary" className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-brand-700">{t.summary}</h4>
        <dl className="mt-3 grid gap-x-6 gap-y-3 text-[0.85rem] sm:grid-cols-2">
          <div className="sm:col-span-2">
            <dt className="text-[0.75rem] font-semibold text-ink-500">{t.recommendation}</dt>
            <dd className="mt-0.5 line-clamp-2 font-semibold text-ink-900">{recommendation.trim() || <span className="font-normal text-ink-400">{t.notRecorded}</span>}</dd>
          </div>
          <div>
            <dt className="text-[0.75rem] font-semibold text-ink-500">{t.servicesShort}</dt>
            <dd className="mt-0.5 font-semibold text-ink-900">{t.selectedCount(serviceCount)}</dd>
          </div>
          <div>
            <dt className="text-[0.75rem] font-semibold text-ink-500">{t.documentsReviewed}</dt>
            <dd className="mt-0.5 font-semibold text-ink-900">{readyDocuments.length}</dd>
          </div>
          <div>
            <dt className="text-[0.75rem] font-semibold text-ink-500">{t.baseEstimate}</dt>
            <dd className="mt-0.5 text-[1rem] font-bold text-brand-900">{money(baseTotal, BASE, locale)}</dd>
          </div>
          {converted && (
            <div>
              <dt className="text-[0.75rem] font-semibold text-ink-500">{t.proposalEstimate}</dt>
              <dd className="mt-0.5 text-[1rem] font-bold text-brand-900">{money(baseTotal * rate, proposalCurrency, locale)}</dd>
            </div>
          )}
        </dl>
        {converted && <p className="mt-2 text-[0.75rem] text-ink-500">{t.approxNote}</p>}

        {error && <p role="alert" className="mt-3 rounded-lg border border-alert-200 bg-white px-3 py-2 text-[0.85rem] font-semibold text-alert-700">{error}</p>}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" className="btn-primary" disabled={busy || !canSubmit} onClick={submit}>{t.submit}</button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={saveDraft}>{t.saveDraft}</button>
        </div>
      </section>

      {/* One disclosure, not four permanent cards: these are exits from the normal path, not alternatives to it. */}
      <details className="mt-4 rounded-xl border border-line px-4 py-3">
        <summary className="cursor-pointer text-[0.85rem] font-semibold text-ink-600">{t.otherOutcome}</summary>
        <div className="mt-3 space-y-2" role="group" aria-label={t.otherOutcome}>
          {OUTCOMES.map(option => (
            <label key={option} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${outcome === option ? "border-brand-500 bg-brand-50" : "border-line hover:border-brand-300"}`}>
              <input type="radio" name="clinical-outcome" className="mt-1 h-4 w-4 flex-none accent-brand-600"
                     checked={outcome === option} onChange={() => { setOutcome(option); setError(""); }}/>
              <span className="min-w-0">
                <span className="block text-[0.9rem] font-bold text-ink-900">{t.outcomeLabel[option]}</span>
                <span className="mt-0.5 block text-[0.8rem] leading-6 text-ink-600">{t.outcomeHint[option]}</span>
              </span>
            </label>
          ))}
          {outcome && (
            <div className="rounded-lg border border-line bg-mist p-3">
              <label htmlFor="outcome-reason" className="block text-[0.82rem] font-bold text-ink-800">{t.outcomeReason}</label>
              <textarea id="outcome-reason" className="field mt-1.5 min-h-20" maxLength={20000} value={outcomeReason} aria-required="true"
                        onChange={event => setOutcomeReason(event.target.value)} placeholder={t.outcomeReasonPlaceholder}/>
              <button type="button" disabled={busy || !outcomeReason.trim()}
                      className={outcome === "NOT_SUITABLE"
                        ? "mt-3 rounded-xl border border-alert-300 bg-alert-50 px-4 py-2 text-[0.9rem] font-bold text-alert-700 transition hover:border-alert-400 disabled:opacity-50"
                        : "btn-secondary mt-3"}
                      onClick={() => { if (outcome !== "NOT_SUITABLE" || window.confirm(t.confirmUnsuitable)) submitOutcome(); }}>
                {t.outcomeConfirm[outcome]}
              </button>
            </div>
          )}
        </div>
      </details>
    </section>
  );
}

function seedSelection(draft: ReviewDraft | undefined, catalog: CatalogService[]) {
  const known = new Set(catalog.map(service => service.id));
  return new Set((draft?.costEstimates ?? []).map(e => e.catalogServiceId).filter((id): id is string => !!id && known.has(id)));
}

function seedOffList(draft: ReviewDraft | undefined) {
  return (draft?.costEstimates ?? [])
    .filter(e => !e.catalogServiceId)
    .map(e => ({ description: e.serviceDescription, amountEgp: Number(e.estimatedCost) || 0 }));
}

function copy(ar: boolean) {
  return ar ? {
    title: "المراجعة السريرية",
    documents: "المستندات", noDocuments: "لم تُرفع مستندات.", preview: "معاينة", download: "تنزيل",
    scanning: "جارٍ الفحص الأمني", unavailable: "غير متاح",
    recommendation: "التوصية السريرية",
    recommendationHint: "لخّص العلاج أو الإجراء الذي توصي به لهذه الحالة.",
    recommendationPlaceholder: "مثال: زراعة منظم ضربات قلب ثنائي الحجرة",
    services: "الخدمات الموصى بها والتقدير",
    servicesHint: "اختر الخدمات التي توصي بها لهذه الحالة. الأسعار مأخوذة من قائمة خدماتك المعتمدة.",
    proposalCurrency: "عملة العرض",
    currencyHint: "ستُعدّ التوصية وعرض المريض بهذه العملة.",
    noCatalog: "لا توجد لديك قائمة خدمات معتمدة بعد. أضف خدمة خارج القائمة أدناه (تتطلب موافقة مالية).",
    needsFinance: "تتطلب موافقة مالية",
    removeService: "إزالة الخدمة",
    offListToggle: "إضافة خدمة خارج قائمتي المعتمدة",
    offListHint: "أي خدمة خارج قائمتك المعتمدة تتطلب موافقة مالية قبل أن تصل إلى عرض المريض.",
    offListName: "اسم الخدمة", offListAmount: "المبلغ التقديري (ج.م)", offListAdd: "إضافة الخدمة",
    considerations: "المخاطر والقيود والاعتبارات السريرية",
    considerationsHint: "اختياري. أضف ما ينبغي أن يعرفه المنسق والمريض قبل المتابعة.",
    summary: "ملخص التوصية", notRecorded: "لم تُسجَّل بعد",
    servicesShort: "الخدمات", documentsReviewed: "المستندات المراجَعة",
    baseEstimate: "السعر المعتمد في قائمتك", proposalEstimate: "قيمة العرض",
    approxNote: "تبقى أسعار قائمتك المعتمدة بالجنيه المصري؛ يُعدّ عرض المريض بالعملة المختارة أعلاه.",
    cataloguePrice: "سعر القائمة المعتمد",
    selectedCount: (n: number) => `${n} مختارة`,
    submit: "إرسال التوصية", saveDraft: "حفظ مسودة",
    otherOutcome: "نتيجة سريرية أخرى",
    outcomeLabel: {
      INFO: "طلب معلومات إضافية", REASSIGN: "طلب رأي ثانٍ",
      RETURN_TO_COORDINATOR: "إعادة دون توصية", NOT_SUITABLE: "غير مناسبة سريريًا",
    } as Record<Outcome, string>,
    outcomeHint: {
      INFO: "يُرسل طلبًا آمنًا للمريض وينقل المسؤولية إليه.",
      REASSIGN: "يعيد الحالة إلى المنسق ليعيّن استشاريًا إضافيًا.",
      RETURN_TO_COORDINATOR: "يعيد المسؤولية إلى المنسق دون تسجيل توصية.",
      NOT_SUITABLE: "يسجّل أن الحالة غير مناسبة سريريًا للعلاج.",
    } as Record<Outcome, string>,
    outcomeConfirm: {
      INFO: "إرسال الطلب", REASSIGN: "طلب رأي ثانٍ",
      RETURN_TO_COORDINATOR: "إعادة إلى المنسق", NOT_SUITABLE: "تأكيد عدم المناسبة السريرية",
    } as Record<Outcome, string>,
    outcomeReason: "السبب السريري",
    outcomeReasonPlaceholder: "اشرح ما يحتاجه المنسق ليتصرف.",
    confirmUnsuitable: "تأكيد أن هذه الحالة غير مناسبة سريريًا؟ لن تستكمل كتوصية عادية.",
    errRecommendation: "سجّل التوصية السريرية قبل الإرسال.",
    errServices: "اختر خدمة واحدة على الأقل قبل الإرسال.",
    errDraft: "أضف توصية أو خدمة قبل حفظ المسودة.",
    errReason: "أضف السبب السريري قبل المتابعة.",
    errOffList: "أدخل اسم الخدمة ومبلغًا أكبر من صفر.",
  } : {
    title: "Clinical review",
    documents: "Documents", noDocuments: "No documents were uploaded.", preview: "Preview", download: "Download",
    scanning: "Security scan in progress", unavailable: "Unavailable",
    recommendation: "Clinical recommendation",
    recommendationHint: "Summarise the treatment or procedure you recommend for this case.",
    recommendationPlaceholder: "For example: dual-chamber pacemaker implantation",
    services: "Recommended services & estimate",
    servicesHint: "Select the services you recommend for this case. Prices are taken from your approved service list.",
    proposalCurrency: "Proposal currency",
    currencyHint: "The recommendation and the patient proposal will be prepared in this currency.",
    noCatalog: "You have no approved service list yet. Add a service outside your list below (it needs Finance approval).",
    needsFinance: "Requires Finance approval",
    removeService: "Remove service",
    offListToggle: "Add service outside my approved list",
    offListHint: "Anything outside your approved list needs Finance approval before it can reach the patient proposal.",
    offListName: "Service name", offListAmount: "Estimated amount (EGP)", offListAdd: "Add service",
    considerations: "Risks, limitations & clinical considerations",
    considerationsHint: "Optional. Anything the coordinator and patient should know before proceeding.",
    summary: "Recommendation summary", notRecorded: "Not recorded yet",
    servicesShort: "Services", documentsReviewed: "Documents reviewed",
    baseEstimate: "Approved catalogue price", proposalEstimate: "Proposal value",
    approxNote: "Your approved catalogue prices stay in EGP; the patient proposal is prepared in the currency selected above.",
    cataloguePrice: "Approved catalogue price",
    selectedCount: (n: number) => `${n} selected`,
    submit: "Submit recommendation", saveDraft: "Save draft",
    otherOutcome: "Other clinical outcome",
    outcomeLabel: {
      INFO: "Request additional information", REASSIGN: "Request second opinion",
      RETURN_TO_COORDINATOR: "Return without recommendation", NOT_SUITABLE: "Not clinically suitable",
    } as Record<Outcome, string>,
    outcomeHint: {
      INFO: "Sends a secure request to the patient and moves responsibility to them.",
      REASSIGN: "Returns the case to the coordinator to assign an additional consultant.",
      RETURN_TO_COORDINATOR: "Hands responsibility back to the coordinator with no recommendation recorded.",
      NOT_SUITABLE: "Records that this case is not clinically suitable for treatment.",
    } as Record<Outcome, string>,
    outcomeConfirm: {
      INFO: "Send request", REASSIGN: "Request second opinion",
      RETURN_TO_COORDINATOR: "Return to coordinator", NOT_SUITABLE: "Confirm not clinically suitable",
    } as Record<Outcome, string>,
    outcomeReason: "Clinical reason",
    outcomeReasonPlaceholder: "Explain what the coordinator needs in order to act.",
    confirmUnsuitable: "Confirm this case is not clinically suitable? It will not continue as a normal recommendation.",
    errRecommendation: "Record your clinical recommendation before submitting.",
    errServices: "Select at least one recommended service before submitting.",
    errDraft: "Add a recommendation or a service before saving a draft.",
    errReason: "Add the clinical reason before continuing.",
    errOffList: "Enter a service name and an amount greater than zero.",
  };
}
