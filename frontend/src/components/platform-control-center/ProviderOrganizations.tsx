"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell, ccCrumbs } from "./ControlCenterShell";
import { useControlCenterAccess } from "./control-center-access";
import { useAdminApi } from "./admin-api";
import { ccHref } from "./control-center-nav";
import { FocusTrapDialog } from "./FocusTrapDialog";
import { EmptyState, ErrorNotice, Field, StatusBadge, SuccessNotice } from "./cc-ui";
import { organizationStatusLabel } from "./admin-labels";
import { orgTypeLabel } from "./control-center-copy";
import type { Organization } from "./provider-directory";

const orgTypes = ["HOSPITAL", "CLINIC", "SOLO_PRACTICE", "DIAGNOSTIC_CENTER"];

/** Providers › Organizations: "which hospitals, clinics and practices do we work with, and are they ready?" */
export function ProviderOrganizations({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const api = useAdminApi();
  const [orgs, setOrgs] = useState<Organization[] | null>(null);
  const [error, setError] = useState<unknown>(null); const [query, setQuery] = useState(""); const [creating, setCreating] = useState(false); const [notice, setNotice] = useState("");
  const load = useCallback(async () => { setError(null); try { setOrgs(await api<Organization[]>("/admin/providers")); } catch (e) { setError(e); setOrgs([]); } }, [api]);
  const canView = access.can("provider.view");
  useEffect(() => { if (user && canView) void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.profile?.sub, canView, load]);
  const title = ar ? "المؤسسات" : "Organizations";
  const canCreate = access.can("provider.create");
  const addButton = canCreate ? <button type="button" onClick={() => setCreating(true)}><Plus size={16} aria-hidden />{ar ? "إضافة مؤسسة" : "Add organization"}</button> : undefined;
  const shell = (body: React.ReactNode) => <ControlCenterShell locale={locale} active="organizations" crumbs={ccCrumbs(locale, { label: title })} title={title} intro={ar ? "المستشفيات والعيادات والممارسات التي تعمل معها، ومدى جاهزيتها." : "The hospitals, clinics and practices you work with, and how ready each one is."} actions={addButton}>{body}</ControlCenterShell>;
  if (authLoading || access.loading) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (!user) return shell(<button onClick={() => void signIn()}>{ar ? "تسجيل الدخول الآمن" : "Sign in securely"}</button>);
  if (!access.can("provider.view")) return shell(<EmptyState title={ar ? "ليس لديك وصول إلى هذه المساحة" : "You do not have access to this area"} body={ar ? "تواصل مع مدير عمليات مقدمي الرعاية." : "Ask your provider operations manager."} />);
  if (orgs === null) return shell(<p role="status">{ar ? "جارٍ تحميل المؤسسات…" : "Loading organizations…"}</p>);
  const filtered = orgs.filter((o) => `${o.displayName} ${o.legalName} ${orgTypeLabel(o.type, locale)}`.toLowerCase().includes(query.toLowerCase()));
  return shell(
    <>
      <ErrorNotice error={error} locale={locale} action="load" onRetry={() => void load()} />
      <SuccessNotice>{notice || null}</SuccessNotice>
      {!orgs.length && !error ? <EmptyState title={ar ? "لا توجد مؤسسات بعد" : "No organizations yet"} body={ar ? "أضف أول مؤسسة لبدء إضافة الاستشاريين إليها." : "Add your first organization to start adding consultants to it."} action={addButton} /> : <>
        {orgs.length > 5 && <div className="cc-filterbar"><label>{ar ? "البحث عن مؤسسة" : "Find an organization"}<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} /></label></div>}
        {!filtered.length ? <EmptyState title={ar ? "لا توجد نتائج مطابقة" : "No organizations match your search"} /> : (
          <ul className="cc-list" aria-label={title}>
            <li className="cc-list-head" aria-hidden><span>{ar ? "المؤسسة" : "Organization"}</span><span>{ar ? "الموقع والعملة" : "Location & currency"}</span><span>{ar ? "الحالة" : "Status"}</span><span /></li>
            {filtered.map((o) => { const s = organizationStatusLabel(o.status, locale); return (
              <li key={o.id}>
                <span><Link className="cc-row-title" href={ccHref(locale, `/providers/${o.id}`)}>{o.displayName}</Link><span className="cc-row-sub">{orgTypeLabel(o.type, locale)}{o.legalName !== o.displayName ? ` · ${o.legalName}` : ""}</span></span>
                <span>{o.countryCode} · {o.defaultCurrency}</span>
                <span><StatusBadge tone={s.tone}>{s.label}</StatusBadge></span>
                <span className="cc-row-actions"><Link className="cc-secondary cc-small" href={ccHref(locale, `/providers/${o.id}`)} aria-label={(ar ? "فتح " : "Open ") + o.displayName}>{ar ? "فتح" : "Open"}</Link></span>
              </li>); })}
          </ul>
        )}
        <p className="cc-meta" style={{ marginTop: 12 }}>{ar ? "تعرض هذه القائمة المؤسسات التي لديك عضوية نشطة فيها فقط." : "This list shows only organizations where you hold an active membership."}</p>
      </>}
      {creating && <CreateOrganizationDialog locale={locale} onClose={() => setCreating(false)} onCreated={(name) => { setCreating(false); setNotice(ar ? `أُضيفت ${name}.` : `${name} was added.`); void load(); }} />}
    </>
  );
}

function CreateOrganizationDialog({ locale, onClose, onCreated }: { locale: Locale; onClose: () => void; onCreated: (name: string) => void }) {
  const ar = locale === "ar";
  const api = useAdminApi();
  const [form, setForm] = useState({ type: orgTypes[0], legalName: "", displayName: "", countryCode: "AE", timeZone: "Asia/Dubai", currency: "AED" });
  const [touched, setTouched] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null);
  const set = (k: keyof typeof form, upper = false) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: upper ? e.target.value.toUpperCase() : e.target.value }));
  const req = (v: string) => (touched && !v.trim() ? (ar ? "هذا الحقل مطلوب." : "This field is required.") : undefined);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setTouched(true);
    if (!form.legalName.trim() || !form.displayName.trim() || form.countryCode.length !== 2 || !form.timeZone.trim() || form.currency.length !== 3) return;
    setBusy(true); setError(null);
    try { await api("/admin/providers", { method: "POST", body: { legalName: form.legalName.trim(), businessName: form.legalName.trim(), displayName: form.displayName.trim(), type: form.type, countryCode: form.countryCode, timeZone: form.timeZone.trim(), defaultCurrency: form.currency } }); onCreated(form.displayName.trim()); }
    catch (err) { setError(err); } finally { setBusy(false); }
  };
  const title = ar ? "إضافة مؤسسة" : "Add organization";
  return (
    <FocusTrapDialog label={title} onClose={onClose}>
      <form onSubmit={submit} noValidate aria-label={title}>
        <h2>{title}</h2>
        <ErrorNotice error={error} locale={locale} />
        <Field label={ar ? "النوع" : "Type"} required><select value={form.type} onChange={set("type")}>{orgTypes.map((v) => <option key={v} value={v}>{orgTypeLabel(v, locale)}</option>)}</select></Field>
        <Field label={ar ? "الاسم القانوني" : "Legal name"} required error={req(form.legalName)}><input maxLength={200} value={form.legalName} onChange={set("legalName")} aria-required /></Field>
        <Field label={ar ? "الاسم الظاهر" : "Display name"} hint={ar ? "الاسم الذي يراه فريقك والمرضى." : "The name your team and patients see."} required error={req(form.displayName)}><input maxLength={160} value={form.displayName} onChange={set("displayName")} aria-required /></Field>
        <div className="cc-form-grid">
          <Field label={ar ? "الدولة" : "Country"} hint={ar ? "رمز من حرفين" : "Two-letter code"} required error={touched && form.countryCode.length !== 2 ? (ar ? "أدخل رمزًا من حرفين." : "Enter a two-letter code.") : undefined}><input maxLength={2} dir="ltr" value={form.countryCode} onChange={set("countryCode", true)} /></Field>
          <Field label={ar ? "العملة" : "Currency"} hint={ar ? "رمز من ثلاثة أحرف" : "Three-letter code"} required error={touched && form.currency.length !== 3 ? (ar ? "أدخل رمزًا من ثلاثة أحرف." : "Enter a three-letter code.") : undefined}><input maxLength={3} dir="ltr" value={form.currency} onChange={set("currency", true)} /></Field>
          <div className="cc-span"><Field label={ar ? "المنطقة الزمنية" : "Time zone"} hint="Asia/Dubai, Africa/Cairo…" required error={req(form.timeZone)}><input dir="ltr" value={form.timeZone} onChange={set("timeZone")} /></Field></div>
        </div>
        <div className="cc-form-actions"><button disabled={busy}>{busy ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "إضافة المؤسسة" : "Add organization")}</button><button type="button" className="cc-secondary" onClick={onClose}>{ar ? "إلغاء" : "Cancel"}</button></div>
      </form>
    </FocusTrapDialog>
  );
}
