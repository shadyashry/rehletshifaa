"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { useControlCenterAccess } from "./control-center-access";
import { useAdminApi } from "./admin-api";
import { careAreaLabel } from "./admin-labels";
import { EmptyState, ErrorNotice, Field, Section, SuccessNotice } from "./cc-ui";
import { FocusTrapDialog } from "./FocusTrapDialog";

type CommercialPolicy = { id: string; careCategory?: string; marginRate: number; active: boolean; version: number; validFrom?: string };
type DepositPolicy = { id: string; careCategory?: string; /** Share of the estimate, 0–1 (W-1). */ depositRate: number;
  /** P0-4: bounds in US dollars, null for none. */ minimumUsd?: number | null; maximumUsd?: number | null; active: boolean; version: number; validFrom?: string };
type CareArea = { slug: string; nameEn: string; nameAr: string };
type Pending = { kind: "margin" | "deposit"; area: string; value: number; minimumUsd?: number | null; maximumUsd?: number | null; form: HTMLFormElement };

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
      if (pending.kind === "margin") await api("/finance/commercial-policies", { method: "PUT", body: { careCategory, marginRate: pending.value / 100 } });
      // P0-4: every revision states its bounds; an empty field is no bound, never "keep the old one".
      else await api("/finance/deposit-policies", { method: "PUT", body: { careCategory, depositRate: pending.value / 100, minimumUsd: pending.minimumUsd ?? null, maximumUsd: pending.maximumUsd ?? null } });
      pending.form.reset(); setPending(null); setNotice(ar ? "حُفظ إصدار جديد." : "New version saved."); await load();
    } catch (e) { setSaveError(e); } finally { setBusy(false); }
  };
  const named = (slug: string) => { const found = careAreas.find((c) => c.slug === slug); return found ? (ar ? found.nameAr : found.nameEn) : careAreaLabel(slug, locale); };
  const area = (a?: string) => (a ? named(a) : ar ? "الافتراضي (كل مجالات الرعاية)" : "Default (all care areas)");
  const since = (d?: string) => d ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(d)) : null;
  const title = ar ? "الهامش والدفعة المقدمة" : "Margin & Deposit";
  const shell = (body: React.ReactNode) => <ControlCenterShell locale={locale} active="marginDeposit" title={title}
    intro={ar ? "إعداد تجاري داخلي: هامش رحلة شفاء ودفعة التنسيق المقدمة." : "Internal commercial configuration: RehletShifaa's margin and the coordination deposit."}>{body}</ControlCenterShell>;
  if (authLoading) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (!user) return shell(<button onClick={() => void signIn()}>{ar ? "تسجيل الدخول الآمن" : "Sign in securely"}</button>);
  if (!allowed) return shell(<EmptyState title={ar ? "ليس لديك وصول إلى سياسات الهامش والدفعة المقدمة" : "You don't have access to margin and deposit policies"} body={ar ? "يديرها الفريق المالي." : "Finance manages these policies."} />);
  if (margins === null) return shell(<p role="status">{ar ? "جارٍ تحميل السياسات…" : "Loading policies…"}</p>);
  if (loadError) return shell(<ErrorNotice error={loadError} locale={locale} action="load" onRetry={() => void load()} />);
  const areaSelect = <Field label={ar ? "مجال الرعاية" : "Care area"}><select name="area"><option value="">{area()}</option>{careAreas.map((a) => <option key={a.slug} value={a.slug}>{ar ? a.nameAr : a.nameEn}</option>)}</select></Field>;
  const usd = (raw: FormDataEntryValue | null) => { const text = String(raw ?? "").trim(); return text === "" ? null : Number(text); };
  const stage = (kind: Pending["kind"]) => (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); const d = new FormData(e.currentTarget); setPending({ kind, area: String(d.get("area") || ""), value: Number(d.get("rate")) || 0, form: e.currentTarget, ...(kind === "deposit" ? { minimumUsd: usd(d.get("minimumUsd")), maximumUsd: usd(d.get("maximumUsd")) } : {}) }); };
  const bounds = (min?: number | null, max?: number | null) => min == null && max == null ? (ar ? "بلا حد أدنى أو أقصى" : "No minimum or maximum")
    : `${min != null ? `${ar ? "الحد الأدنى" : "Minimum"} ${min} USD` : ""}${min != null && max != null ? " · " : ""}${max != null ? `${ar ? "الحد الأقصى" : "Maximum"} ${max} USD` : ""}`;
  const currentDefault = deposits.find((p) => p.active && !p.careCategory);
  return shell(<>
    <p className="cc-internal" role="note"><strong>{ar ? "داخلي فقط." : "Internal only."}</strong> {ar ? "لا يظهر الهامش أبدًا للمرضى أو الأطباء أو الجهات الطبية؛ يرى المريض سعر الباقة الشامل ودفعة التنسيق فقط." : "The margin is never shown to patients, clinicians or provider organizations; patients see only the inclusive package price and the coordination deposit."}</p>
    <SuccessNotice>{notice || null}</SuccessNotice>
    <ErrorNotice error={saveError} locale={locale} />
    <Section id="margin" title={ar ? "سياسة الهامش" : "Margin policy"} description={ar ? "يُدمج في سعر الباقة عند إنشاء التقدير المبدئي. يستخدم العرض النهائي الهامش نفسه المثبّت في التقدير المبدئي للحالة." : "Built into the package price when a preliminary estimate is created. The final quote reuses the margin locked in the case's preliminary estimate."}>
      <ul className="cc-list">{margins.filter((p) => p.active).map((p) => <li key={p.id}><span><strong>{area(p.careCategory)}</strong></span><span><bdi dir="ltr">{(p.marginRate * 100).toFixed(2)}%</bdi></span><span className="cc-meta">{since(p.validFrom) ? (ar ? `سارية منذ ${since(p.validFrom)}` : `In use since ${since(p.validFrom)}`) : (ar ? "سارية" : "In use")}</span><span /></li>)}</ul>
      {canEdit && <form className="cc-filterbar" onSubmit={stage("margin")} aria-label={ar ? "إصدار جديد من سياسة الهامش" : "New margin policy version"}>
        {areaSelect}
        <Field label={ar ? "الهامش %" : "Margin %"}><input name="rate" type="number" min="0" max="50" step="0.1" required dir="ltr" /></Field>
        <button disabled={busy}>{ar ? "مراجعة الإصدار الجديد" : "Review new version"}</button>
      </form>}
    </Section>
    <Section id="deposit" title={ar ? "سياسة دفعة التنسيق" : "Coordination deposit policy"} description={ar ? "نسبة من الإجمالي المتوقَّع في التقدير المبدئي، تُطلب عندما يُقرّ المريض بالتقدير، وتُحوَّل بسعر الصرف المجمَّد فيه." : "A share of the preliminary estimate's expected total, requested when the patient acknowledges the estimate and converted at its frozen exchange rate."}>
      <ul className="cc-list">{deposits.filter((p) => p.active).map((p) => <li key={p.id}><span><strong>{area(p.careCategory)}</strong></span><span><bdi dir="ltr">{(p.depositRate * 100).toFixed(2)}%</bdi> <span className="cc-meta"><bdi dir="ltr">{bounds(p.minimumUsd, p.maximumUsd)}</bdi></span></span><span className="cc-meta">{since(p.validFrom) ? (ar ? `سارية منذ ${since(p.validFrom)}` : `In use since ${since(p.validFrom)}`) : (ar ? "سارية" : "In use")}</span><span /></li>)}</ul>
      {canEdit && <form className="cc-filterbar" onSubmit={stage("deposit")} aria-label={ar ? "إصدار جديد من سياسة دفعة التنسيق" : "New coordination deposit policy version"}>
        {areaSelect}
        <Field label={ar ? "دفعة التنسيق (% من التقدير)" : "Coordination deposit (% of the estimate)"}><input name="rate" type="number" min="0" max="100" step="0.01" required dir="ltr" /></Field>
        <Field label={ar ? "الحد الأدنى (دولار أمريكي)" : "Minimum (USD)"}><input name="minimumUsd" type="number" min="0" step="1" dir="ltr" defaultValue={currentDefault?.minimumUsd ?? 200} /></Field>
        <Field label={ar ? "الحد الأقصى (دولار أمريكي)" : "Maximum (USD)"}><input name="maximumUsd" type="number" min="1" step="1" dir="ltr" defaultValue={currentDefault?.maximumUsd ?? 1500} /></Field>
        <button disabled={busy}>{ar ? "مراجعة الإصدار الجديد" : "Review new version"}</button>
      </form>}
    </Section>
    {pending && <FocusTrapDialog label={ar ? "تأكيد الإصدار الجديد" : "Confirm new version"} onClose={busy ? () => undefined : () => setPending(null)}>
      <h2>{pending.kind === "margin" ? (ar ? "حفظ إصدار جديد من الهامش؟" : "Save a new margin version?") : (ar ? "حفظ إصدار جديد من دفعة التنسيق؟" : "Save a new coordination deposit version?")}</h2>
      <p><strong>{area(pending.area || undefined)}</strong> · <bdi dir="ltr">{pending.value.toFixed(2)}%</bdi>{pending.kind === "deposit" ? (ar ? " من التقدير" : " of the estimate") : null}{pending.kind === "deposit" && <> · <bdi dir="ltr">{bounds(pending.minimumUsd, pending.maximumUsd)}</bdi></>}</p>
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
