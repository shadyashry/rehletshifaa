"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { useControlCenterAccess } from "./control-center-access";
import { useAdminApi } from "./admin-api";
import { careAreaLabel } from "./admin-labels";
import { EmptyState, ErrorNotice, Field, Section, SuccessNotice } from "./cc-ui";

type CommercialPolicy = { id: string; careCategory?: string; marginRate: number; active: boolean; version: number };
type DepositPolicy = { id: string; careCategory?: string; coordinationDepositEgp: number; active: boolean; version: number };
const AREAS = ["cardiology", "rheumatology-rehabilitation", "orthopedics"];

/**
 * Commercial › Margin & Deposit — the central margin and coordination-deposit policies, formerly a collapsible panel in
 * the Finance workspace. Same endpoints, methods and bodies (`/finance/commercial-policies`, `/finance/deposit-policies`);
 * the backend keeps its Finance role gate and recent-authentication rule for saving a new version.
 */
export function MarginDeposit({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const api = useAdminApi();
  const [margins, setMargins] = useState<CommercialPolicy[] | null>(null);
  const [deposits, setDeposits] = useState<DepositPolicy[]>([]);
  const [loadError, setLoadError] = useState<unknown>(null); const [saveError, setSaveError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  const allowed = access.legacy.financePolicy;
  const load = useCallback(async () => {
    setLoadError(null);
    try { const [c, d] = await Promise.all([api<CommercialPolicy[]>("/finance/commercial-policies"), api<DepositPolicy[]>("/finance/deposit-policies")]); setMargins(c); setDeposits(d); }
    catch (e) { setLoadError(e); setMargins([]); }
  }, [api]);
  useEffect(() => { if (user && allowed) void load(); }, [user, allowed, load]);
  const save = async (form: HTMLFormElement, path: string, body: unknown) => {
    setBusy(true); setSaveError(null); setNotice("");
    try { await api(path, { method: "PUT", body }); form.reset(); setNotice(ar ? "حُفظ إصدار جديد." : "New version saved."); await load(); }
    catch (e) { setSaveError(e); } finally { setBusy(false); }
  };
  const area = (a?: string) => (a ? careAreaLabel(a, locale) : ar ? "الافتراضي (كل مجالات الرعاية)" : "Default (all care areas)");
  const title = ar ? "الهامش والدفعة المقدمة" : "Margin & Deposit";
  const shell = (body: React.ReactNode) => <ControlCenterShell locale={locale} active="marginDeposit" title={title}
    intro={ar ? "تُطبَّق هذه السياسات على الحالات الجديدة فقط، ولا تتغيّر بعد إصدار تقدير مبدئي." : "These policies apply to new cases only and never change after a preliminary estimate is released."}>{body}</ControlCenterShell>;
  if (authLoading) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (!user) return shell(<button onClick={() => void signIn()}>{ar ? "تسجيل الدخول الآمن" : "Sign in securely"}</button>);
  if (!allowed) return shell(<EmptyState title={ar ? "ليس لديك وصول إلى سياسات الهامش والدفعة المقدمة" : "You don't have access to margin and deposit policies"} body={ar ? "يديرها قادة الفريق المالي." : "Finance leads manage these policies."} />);
  if (margins === null) return shell(<p role="status">{ar ? "جارٍ تحميل السياسات…" : "Loading policies…"}</p>);
  if (loadError) return shell(<ErrorNotice error={loadError} locale={locale} action="load" onRetry={() => void load()} />);
  const areaSelect = <Field label={ar ? "مجال الرعاية" : "Care area"}><select name="area"><option value="">{area()}</option>{AREAS.map((a) => <option key={a} value={a}>{area(a)}</option>)}</select></Field>;
  return shell(<>
    <SuccessNotice>{notice || null}</SuccessNotice>
    <ErrorNotice error={saveError} locale={locale} />
    <p className="cc-meta">{ar ? "حفظ إصدار جديد يتطلب تسجيل دخول حديثًا." : "Saving a new version asks for a recent sign-in."}</p>
    <Section id="margin" title={ar ? "سياسة الهامش" : "Margin policy"} description={ar ? "يُدمج في باقة المريض." : "Included in the patient package."}>
      <ul className="cc-list">{margins.filter((p) => p.active).map((p) => <li key={p.id}><span><strong>{area(p.careCategory)}</strong></span><span dir="ltr">{(p.marginRate * 100).toFixed(2)}%</span><span className="cc-meta">{ar ? "الإصدار" : "Version"} {p.version}</span><span /></li>)}</ul>
      <form className="cc-filterbar" onSubmit={(e) => { e.preventDefault(); const d = new FormData(e.currentTarget); void save(e.currentTarget, "/finance/commercial-policies", { careCategory: String(d.get("area") || "") || undefined, marginRate: (Number(d.get("rate")) || 0) / 100 }); }}>
        {areaSelect}
        <Field label={ar ? "الهامش %" : "Margin %"}><input name="rate" type="number" min="0" max="50" step="0.1" required /></Field>
        <button disabled={busy}>{ar ? "حفظ إصدار جديد" : "Save new version"}</button>
      </form>
    </Section>
    <Section id="deposit" title={ar ? "سياسة الدفعة المقدمة" : "Deposit policy"} description={ar ? "دفعة التنسيق المقدمة بالجنيه المصري." : "The coordination deposit, in EGP."}>
      <ul className="cc-list">{deposits.filter((p) => p.active).map((p) => <li key={p.id}><span><strong>{area(p.careCategory)}</strong></span><span>{new Intl.NumberFormat(locale).format(p.coordinationDepositEgp)} EGP</span><span className="cc-meta">{ar ? "الإصدار" : "Version"} {p.version}</span><span /></li>)}</ul>
      <form className="cc-filterbar" onSubmit={(e) => { e.preventDefault(); const d = new FormData(e.currentTarget); void save(e.currentTarget, "/finance/deposit-policies", { careCategory: String(d.get("area") || "") || undefined, coordinationDepositEgp: Number(d.get("amount")) || 0 }); }}>
        {areaSelect}
        <Field label={ar ? "دفعة التنسيق (ج.م)" : "Coordination deposit (EGP)"}><input name="amount" type="number" min="0" step="0.01" required /></Field>
        <button disabled={busy}>{ar ? "حفظ إصدار جديد" : "Save new version"}</button>
      </form>
    </Section>
  </>);
}
