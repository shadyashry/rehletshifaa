"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { getDictionary } from "@/lib/dictionary";
import { intlLocale, type Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { useControlCenterAccess } from "./control-center-access";
import { useAdminApi } from "./admin-api";
import { careAreaLabel } from "./admin-labels";
import { EmptyState, ErrorNotice, Field, Section, SuccessNotice, WordedErrorNotice } from "./cc-ui";
import { FocusTrapDialog } from "./FocusTrapDialog";

type CommercialPolicy = { id: string; careCategory?: string; marginRate: number; minimumCoordinationFeeEgp?: number; /** P0-5 (A-07): a manual line at or below this EGP figure needs no Finance; null for none. */ manualBandEgp?: number | null;
  /** P1-10 (B-05): days a released final quote stays acceptable, and the exchange-rate move (0–1) beyond which Finance re-approves. */
  finalQuoteValidityDays?: number; fxToleranceRate?: number;
  /** P1-16 (D-E): a change order within the lower of this share (0–0.5) of the facility package and this EGP cap is Finance's alone. */
  changeOrderBandRate?: number; changeOrderBandEgp?: number;
  /** P1-17 (D-F): hours after the examination a fit to fly stays valid for a return flight (24–168). */
  fitToFlyHours?: number;
  /** P1-18 (D-G): days of free follow-up after discharge (7–90), frozen per case at discharge. */
  followUpFreeDays?: number; active: boolean; version: number; validFrom?: string };
type DepositPolicy = { id: string; careCategory?: string; /** Share of the estimate, 0–1 (W-1). */ depositRate: number; refundCutoffDays?: number;
  /** P0-4: bounds in US dollars, null for none. */ minimumUsd?: number | null; maximumUsd?: number | null; active: boolean; version: number; validFrom?: string };
type CareArea = { slug: string; nameEn: string; nameAr: string };
type Pending = { kind: "margin" | "deposit"; area: string; value: number; minimumCoordinationFeeEgp?: number; refundCutoffDays?: number; minimumUsd?: number | null; maximumUsd?: number | null; manualBandEgp?: number | null; finalQuoteValidityDays?: number; fxTolerancePercent?: number; bandPercent?: number; bandEgp?: number; fitToFlyHours?: number; followUpFreeDays?: number; form: HTMLFormElement };

/**
 * Commercial › Margin & Deposit — internal commercial configuration: the central margin and coordination-deposit policies.
 * Same endpoints, methods and bodies (`/finance/commercial-policies`, `/finance/deposit-policies`); the backend keeps its
 * Finance role gate and recent-authentication rule. When each applies (verified in code): the margin is taken when a
 * preliminary estimate is created and the final quote reuses that locked margin; the deposit amount is taken when the
 * patient acknowledges the preliminary estimate. Existing estimates, quotes and deposits never change.
 */
export function MarginDeposit({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const api = useAdminApi();
  const [margins, setMargins] = useState<CommercialPolicy[] | null>(null);
  const [deposits, setDeposits] = useState<DepositPolicy[]>([]);
  // QA #22: the care areas come from the platform's list, so a policy can be set for every one of them.
  const [careAreas, setCareAreas] = useState<CareArea[]>([]);
  const [loadError, setLoadError] = useState<unknown>(null); const [saveError, setSaveError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState(""); const [pending, setPending] = useState<Pending | null>(null);
  const allowed = access.can("COMMERCIAL_POLICY_READ");
  // Reading is shared with Finance, Consultant Operations and the auditor; only Finance Managers and System Administrators
  // publish a new version (owner, 2026-10-14).
  const canEdit = access.can("COMMERCIAL_POLICY_MANAGE");
  const read = useCallback(() => Promise.all([api<CommercialPolicy[]>("/finance/commercial-policies"), api<DepositPolicy[]>("/finance/deposit-policies"), api<CareArea[]>("/finance/care-areas")]), [api]);
  const load = useCallback(async () => {
    setLoadError(null);
    try { const [c, d, a] = await read(); setMargins(c); setDeposits(d); setCareAreas(a); }
    catch (e) { setLoadError(e); setMargins([]); }
  }, [read]);
  useEffect(() => {
    if (!user || !allowed) return;
    let live = true;
    read().then(([c, d, a]) => { if (live) { setMargins(c); setDeposits(d); setCareAreas(a); } }, (e) => { if (live) { setLoadError(e); setMargins([]); } });
    return () => { live = false; };
  }, [user, allowed, read]);
  const confirm = async () => {
    if (!pending) return;
    setBusy(true); setSaveError(null); setNotice("");
    const careCategory = pending.area || undefined;
    try {
      // P0-5: every margin revision states its pre-approved manual band too; an empty field means no band (every manual line needs Finance).
      if (pending.kind === "margin") await api("/finance/commercial-policies", { method: "PUT", body: { careCategory, marginRate: pending.value / 100, manualBandEgp: pending.manualBandEgp ?? null,
        // P1-10: every revision also states how long a final quote stands and how far the rate may move; both are prefilled, never silently reset.
        finalQuoteValidityDays: pending.finalQuoteValidityDays, fxToleranceRate: pending.fxTolerancePercent == null ? undefined : pending.fxTolerancePercent / 100,
        // P1-16: and the change-order band (both prefilled; left out, the backend carries the current values over).
        changeOrderBandRate: pending.bandPercent == null ? undefined : pending.bandPercent / 100, changeOrderBandEgp: pending.bandEgp,
        // P1-17: and the fit-to-fly window (prefilled; left out, the backend carries the current value over).
        fitToFlyHours: pending.fitToFlyHours,
        // P1-18: and the free follow-up (prefilled; left out, the backend carries the current value over).
        followUpFreeDays: pending.followUpFreeDays, minimumCoordinationFeeEgp: pending.minimumCoordinationFeeEgp } });
      // P0-4: every revision states its bounds; an empty field is no bound, never "keep the old one".
      else await api("/finance/deposit-policies", { method: "PUT", body: { careCategory, depositRate: pending.value / 100, minimumUsd: pending.minimumUsd ?? null, maximumUsd: pending.maximumUsd ?? null, refundCutoffDays: pending.refundCutoffDays } });
      pending.form.reset(); setPending(null); setNotice(ar ? "حُفظ إصدار جديد." : "New version saved."); await load();
    } catch (e) { setSaveError(e); } finally { setBusy(false); }
  };
  const named = (slug: string) => { const found = careAreas.find((c) => c.slug === slug); return found ? (ar ? found.nameAr : found.nameEn) : careAreaLabel(slug, locale); };
  const area = (a?: string) => (a ? named(a) : ar ? "الافتراضي (كل مجالات الرعاية)" : "Default (all care areas)");
  const since = (d?: string) => d ? new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" }).format(new Date(d)) : null;
  const title = ar ? "الهامش والدفعة المقدمة" : "Margin & Deposit";
  // UX 4-3: where Finance reads its margin and deposit policies, the page is in Petrol & Paper (the rest of the Control Center is area 6).
  const shell = (body: React.ReactNode) => <ControlCenterShell locale={locale} active="marginDeposit" title={title} className="cc-petrol"
    intro={ar ? "إعداد تجاري داخلي: هامش رحلة شفاء ودفعة التنسيق المقدمة." : "Internal commercial configuration: RehletShifaa's margin and the coordination deposit."}>{body}</ControlCenterShell>;
  if (authLoading) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (!user) return shell(<button onClick={() => void signIn()}>{ar ? "تسجيل الدخول الآمن" : "Sign in securely"}</button>);
  if (!allowed) return shell(<EmptyState title={ar ? "ليس لديك وصول إلى سياسات الهامش والدفعة المقدمة" : "You don't have access to margin and deposit policies"} body={ar ? "يديرها الفريق المالي." : "Finance manages these policies."} />);
  if (margins === null) return shell(<p role="status">{ar ? "جارٍ تحميل السياسات…" : "Loading policies…"}</p>);
  if (loadError) return shell(<ErrorNotice error={loadError} locale={locale} action="load" onRetry={() => void load()} />);
  const areaSelect = <Field label={ar ? "مجال الرعاية" : "Care area"}><select name="area"><option value="">{area()}</option>{careAreas.map((a) => <option key={a.slug} value={a.slug}>{ar ? a.nameAr : a.nameEn}</option>)}</select></Field>;
  const usd = (raw: FormDataEntryValue | null) => { const text = String(raw ?? "").trim(); return text === "" ? null : Number(text); };
  const stage = (kind: Pending["kind"]) => (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); const d = new FormData(e.currentTarget); setPending({ kind, area: String(d.get("area") || ""), value: Number(d.get("rate")) || 0, form: e.currentTarget, ...(kind === "deposit" ? { refundCutoffDays: Number(d.get("refundCutoffDays")), minimumUsd: usd(d.get("minimumUsd")), maximumUsd: usd(d.get("maximumUsd")) } : { minimumCoordinationFeeEgp: Number(d.get("minimumCoordinationFeeEgp")), manualBandEgp: usd(d.get("manualBandEgp")), finalQuoteValidityDays: Number(d.get("finalQuoteValidityDays")) || undefined, fxTolerancePercent: usd(d.get("fxTolerancePercent")) ?? undefined, bandPercent: usd(d.get("bandPercent")) ?? undefined, bandEgp: usd(d.get("bandEgp")) ?? undefined, fitToFlyHours: usd(d.get("fitToFlyHours")) ?? undefined, followUpFreeDays: usd(d.get("followUpFreeDays")) ?? undefined }) }); };
  const bounds = (min?: number | null, max?: number | null) => min == null && max == null ? (ar ? "بلا حد أدنى أو أقصى" : "No minimum or maximum")
    : `${min != null ? `${ar ? "الحد الأدنى" : "Minimum"} ${min} USD` : ""}${min != null && max != null ? " · " : ""}${max != null ? `${ar ? "الحد الأقصى" : "Maximum"} ${max} USD` : ""}`;
  const currentDefault = deposits.find((p) => p.active && !p.careCategory);
  const currentMargin = margins.find((p) => p.active && !p.careCategory);
  const validity = (days?: number, tolerance?: number) => days == null || tolerance == null ? ""
    : ar ? `العرض النهائي صالح ${days} يومًا · يراجع الفريق المالي سعر الصرف عند تغيّره بأكثر من ${(tolerance * 100).toFixed(2)}%` : `Final quote valid ${days} days · Finance re-approves a rate move beyond ${(tolerance * 100).toFixed(2)}%`;
  const refundCutoff = (days = 10) => ar ? `حد الاسترداد قبل الموعد الأول بـ ${days} أيام` : `Refund cutoff: ${days} days before the first appointment`;
  const minimumFee = (amount = 0) => ar ? `الحد الأدنى لرسوم التنسيق ${amount} ج.م` : `Minimum coordination fee EGP ${amount}`;
  const freeFollowUp = (days?: number) => days == null ? "" : ar ? `متابعة مجانية ${days} يومًا بعد الخروج` : `Free follow-up for ${days} days after discharge`;
  const fitToFly = (hours?: number) => hours == null ? "" : ar ? `شهادة اللياقة للسفر صالحة ${hours} ساعة بعد الفحص` : `A fit to fly is valid ${hours} hours after the examination`;
  const changeBand = (rate?: number, cap?: number) => rate == null || cap == null ? ""
    : ar ? `أوامر التغيير حتى ${(rate * 100).toFixed(2)}% من الباقة أو ${cap} ج.م (أيهما أقل) تقررها المالية` : `Change orders up to ${(rate * 100).toFixed(2)}% of the package or EGP ${cap} (the lower) are Finance's to decide`;
  const band = (b?: number | null) => b == null ? (ar ? "كل بند يدوي يحتاج الفريق المالي" : "Every manual line needs Finance")
    : (ar ? `البنود اليدوية حتى ${b} ج.م تُطلق بلا الفريق المالي` : `Manual lines up to EGP ${b} release without Finance`);
  return shell(<>
    <p className="cc-internal" role="note"><strong>{ar ? "داخلي فقط." : "Internal only."}</strong> {ar ? "لا يظهر الهامش أبدًا للمرضى أو الأطباء أو الجهات الطبية؛ يرى المريض سعر الباقة الشامل ودفعة التنسيق فقط." : "The margin is never shown to patients, clinicians or provider organizations; patients see only the inclusive package price and the coordination deposit."}</p>
    <SuccessNotice>{notice || null}</SuccessNotice>
    <WordedErrorNotice error={saveError} locale={locale} words={getDictionary(locale).portalWork.errorCodes} />
    <Section id="margin" title={ar ? "سياسة الهامش" : "Margin policy"} description={ar ? "يُدمج في سعر الباقة عند إنشاء التقدير المبدئي. يستخدم العرض النهائي الهامش نفسه المثبّت في التقدير المبدئي للحالة." : "Built into the package price when a preliminary estimate is created. The final quote reuses the margin locked in the case's preliminary estimate."}>
      <ul className="cc-list">{margins.filter((p) => p.active).map((p) => <li key={p.id}><span><strong>{area(p.careCategory)}</strong></span><span><bdi dir="ltr">{(p.marginRate * 100).toFixed(2)}%</bdi> <span className="cc-meta">{band(p.manualBandEgp)}</span> <span className="cc-meta">{validity(p.finalQuoteValidityDays, p.fxToleranceRate)}</span> <span className="cc-meta">{changeBand(p.changeOrderBandRate, p.changeOrderBandEgp)}</span> <span className="cc-meta">{fitToFly(p.fitToFlyHours)}</span> <span className="cc-meta">{freeFollowUp(p.followUpFreeDays)}</span> <span className="cc-meta">{minimumFee(p.minimumCoordinationFeeEgp)}</span></span><span className="cc-meta">{since(p.validFrom) ? (ar ? `سارية منذ ${since(p.validFrom)}` : `In use since ${since(p.validFrom)}`) : (ar ? "سارية" : "In use")}</span><span /></li>)}</ul>
      {canEdit && <form className="cc-filterbar" onSubmit={stage("margin")} aria-label={ar ? "إصدار جديد من سياسة الهامش" : "New margin policy version"}>
        {areaSelect}
        <Field label={ar ? "الحد الأدنى لرسوم التنسيق (ج.م)" : "Minimum coordination fee (EGP)"}><input name="minimumCoordinationFeeEgp" type="number" min="0" step="0.01" required dir="ltr" defaultValue={currentMargin?.minimumCoordinationFeeEgp ?? 0} /></Field>
        <Field label={ar ? "الهامش %" : "Margin %"}><input name="rate" type="number" min="0" max="50" step="0.1" required dir="ltr" /></Field>
        <Field label={ar ? "النطاق اليدوي المعتمد مسبقًا (ج.م)" : "Pre-approved manual band (EGP)"} hint={ar ? "بند يدوي بهذا السعر أو أقل لا يحتاج الفريق المالي؛ اتركه فارغًا ليحتاجه كل بند." : "A manual line at or below this price needs no Finance; leave empty so every manual line does."}><input name="manualBandEgp" type="number" min="0" step="100" dir="ltr" defaultValue={currentMargin?.manualBandEgp ?? ""} /></Field>
        <Field label={ar ? "صلاحية العرض النهائي (أيام)" : "Final quote validity (days)"} hint={ar ? "المدة التي يبقى فيها العرض النهائي قابلًا للقبول بعد إرساله؛ يستطيع المنسّق تقصيرها فقط." : "How long a released final quote can be accepted; the coordinator can shorten it, never lengthen it."}><input name="finalQuoteValidityDays" type="number" min="1" max="90" step="1" required dir="ltr" defaultValue={currentMargin?.finalQuoteValidityDays ?? 14} /></Field>
        <Field label={ar ? "هامش تغيّر سعر الصرف (%)" : "Exchange-rate tolerance (%)"} hint={ar ? "إذا تحرّك سعر الصرف بأكثر من هذه النسبة عند قبول العرض النهائي، يوافق الفريق المالي من جديد قبل أن يقبل المريض." : "If the rate has moved by more than this when a final quote is accepted, Finance re-approves before the patient can accept."}><input name="fxTolerancePercent" type="number" min="0" max="50" step="0.1" required dir="ltr" defaultValue={currentMargin?.fxToleranceRate == null ? 3 : +(currentMargin.fxToleranceRate * 100).toFixed(2)} /></Field>
        <Field label={ar ? "نطاق أوامر التغيير (% من الباقة)" : "Change-order band (% of the package)"} hint={ar ? "أمر تغيير ضمن الأقل من هذه النسبة من باقة المنشأة والحد الأقصى أدناه تقرره المالية وحدها؛ وفوقه يقرر المريض. يُحسب تراكميًا لكل حالة." : "A change order within the lower of this share of the facility package and the cap below is Finance's alone; above it the patient decides. Counted cumulatively per case."}><input name="bandPercent" type="number" min="0" max="50" step="0.1" required dir="ltr" defaultValue={currentMargin?.changeOrderBandRate == null ? 10 : +(currentMargin.changeOrderBandRate * 100).toFixed(2)} /></Field>
        <Field label={ar ? "الحد الأقصى لنطاق أوامر التغيير (ج.م)" : "Change-order band cap (EGP)"}><input name="bandEgp" type="number" min="0" step="100" required dir="ltr" defaultValue={currentMargin?.changeOrderBandEgp ?? 15000} /></Field>
        <Field label={ar ? "مدة صلاحية شهادة اللياقة للسفر (ساعات)" : "Fit-to-fly window (hours)"} hint={ar ? "تبقى شهادة اللياقة للسفر صالحة لرحلة العودة هذه المدة بعد فحص الاستشاري؛ لا تؤكد العمليات رحلة عودة بعدها." : "A fit to fly stays valid for the return flight this long after the Consultant's examination; Operations cannot confirm a flight after it."}><input name="fitToFlyHours" type="number" min="24" max="168" step="1" required dir="ltr" defaultValue={currentMargin?.fitToFlyHours ?? 72} /></Field>
        <Field label={ar ? "المتابعة المجانية (أيام)" : "Free follow-up (days)"} hint={ar ? "مدة المتابعة المجانية بعد الخروج، تُثبَّت لكل حالة عند خروجها؛ تُغلق الحالة تلقائيًا بعدها ما لم يمنع ذلك شيء." : "How long the free follow-up lasts after discharge, fixed per case at its discharge; the case closes on its own after it unless something holds it."}><input name="followUpFreeDays" type="number" min="7" max="90" step="1" required dir="ltr" defaultValue={currentMargin?.followUpFreeDays ?? 30} /></Field>
        <button disabled={busy}>{ar ? "مراجعة الإصدار الجديد" : "Review new version"}</button>
      </form>}
    </Section>
    <Section id="deposit" title={ar ? "سياسة دفعة التنسيق" : "Coordination deposit policy"} description={ar ? "نسبة من الإجمالي المتوقَّع في التقدير المبدئي، تُطلب عندما يُقرّ المريض بالتقدير، وتُحوَّل بسعر الصرف المجمَّد فيه." : "A share of the preliminary estimate's expected total, requested when the patient acknowledges the estimate and converted at its frozen exchange rate."}>
      <ul className="cc-list">{deposits.filter((p) => p.active).map((p) => <li key={p.id}><span><strong>{area(p.careCategory)}</strong></span><span><bdi dir="ltr">{(p.depositRate * 100).toFixed(2)}%</bdi> <span className="cc-meta"><bdi dir="ltr">{bounds(p.minimumUsd, p.maximumUsd)}</bdi></span> <span className="cc-meta">{refundCutoff(p.refundCutoffDays)}</span></span><span className="cc-meta">{since(p.validFrom) ? (ar ? `سارية منذ ${since(p.validFrom)}` : `In use since ${since(p.validFrom)}`) : (ar ? "سارية" : "In use")}</span><span /></li>)}</ul>
      {canEdit && <form className="cc-filterbar" onSubmit={stage("deposit")} aria-label={ar ? "إصدار جديد من سياسة دفعة التنسيق" : "New coordination deposit policy version"}>
        {areaSelect}
        <Field label={ar ? "دفعة التنسيق (% من التقدير)" : "Coordination deposit (% of the estimate)"}><input name="rate" type="number" min="0" max="100" step="0.01" required dir="ltr" /></Field>
        <Field label={ar ? "حد الاسترداد قبل الموعد (أيام)" : "Refund cutoff before appointment (days)"}><input name="refundCutoffDays" type="number" min="0" step="1" required dir="ltr" defaultValue={currentDefault?.refundCutoffDays ?? 10} /></Field>
        <Field label={ar ? "الحد الأدنى (دولار أمريكي)" : "Minimum (USD)"}><input name="minimumUsd" type="number" min="0" step="1" dir="ltr" defaultValue={currentDefault?.minimumUsd ?? 200} /></Field>
        <Field label={ar ? "الحد الأقصى (دولار أمريكي)" : "Maximum (USD)"}><input name="maximumUsd" type="number" min="1" step="1" dir="ltr" defaultValue={currentDefault?.maximumUsd ?? 1500} /></Field>
        <button disabled={busy}>{ar ? "مراجعة الإصدار الجديد" : "Review new version"}</button>
      </form>}
    </Section>
    {pending && <FocusTrapDialog label={ar ? "تأكيد الإصدار الجديد" : "Confirm new version"} onClose={busy ? () => undefined : () => setPending(null)}>
      <h2>{pending.kind === "margin" ? (ar ? "حفظ إصدار جديد من الهامش؟" : "Save a new margin version?") : (ar ? "حفظ إصدار جديد من دفعة التنسيق؟" : "Save a new coordination deposit version?")}</h2>
      <p><strong>{area(pending.area || undefined)}</strong> · <bdi dir="ltr">{pending.value.toFixed(2)}%</bdi>{pending.kind === "deposit" ? (ar ? " من التقدير" : " of the estimate") : null}{pending.kind === "deposit" && <> · <bdi dir="ltr">{bounds(pending.minimumUsd, pending.maximumUsd)}</bdi> · {refundCutoff(pending.refundCutoffDays)}</>}{pending.kind === "margin" && <> · {band(pending.manualBandEgp)} · {minimumFee(pending.minimumCoordinationFeeEgp)} · {ar ? `صلاحية العرض النهائي ${pending.finalQuoteValidityDays} يومًا` : `final quote valid ${pending.finalQuoteValidityDays} days`} · {ar ? `هامش سعر الصرف ${pending.fxTolerancePercent}%` : `rate tolerance ${pending.fxTolerancePercent}%`}{pending.bandPercent != null && pending.bandEgp != null && <> · {changeBand(pending.bandPercent / 100, pending.bandEgp)}</>}{pending.fitToFlyHours != null && <> · {fitToFly(pending.fitToFlyHours)}</>}{pending.followUpFreeDays != null && <> · {freeFollowUp(pending.followUpFreeDays)}</>}</>}</p>
      <ul className="cc-consequences">
        <li>{ar ? "يحل محل الإصدار الحالي لمجال الرعاية هذا فورًا." : "It replaces the current version for this care area immediately."}</li>
        <li>{pending.kind === "margin"
          ? (ar ? "يُستخدم للتقديرات المبدئية التي تُنشأ من الآن. التقديرات والعروض النهائية الموجودة تحتفظ بالهامش الذي حُسبت به." : "It is used for preliminary estimates created from now on. Existing estimates and final quotes keep the margin they were calculated with.")
          : (ar ? "يُطلب عندما يُقرّ المريض بتقديره المبدئي من الآن. دفعات التنسيق المطلوبة سابقًا لا تتغير." : "It is requested when a patient acknowledges their preliminary estimate from now on. Coordination deposits already requested don't change.")}</li>
        <li>{ar ? "قد يُطلب منك تسجيل الدخول مجددًا للتأكيد." : "You may be asked to sign in again to confirm."}</li>
      </ul>
      <div className="cc-form-actions"><button type="button" disabled={busy} onClick={() => void confirm()}>{ar ? "حفظ الإصدار الجديد" : "Save new version"}</button><button type="button" className="cc-secondary" disabled={busy} onClick={() => setPending(null)}>{ar ? "إلغاء" : "Cancel"}</button></div>
    </FocusTrapDialog>}
  </>);
}
