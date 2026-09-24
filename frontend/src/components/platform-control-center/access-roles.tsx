"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Check as CheckIcon, Minus, Plus } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { accessCopy, businessLabel, familyLabel, permissionLabel, roleLabel } from "./access-copy";
import { ccHref } from "./control-center-nav";
import { EmptyState, Facts, Field, StatusBadge, TechnicalDetails } from "./cc-ui";
import { FocusTrapDialog } from "./FocusTrapDialog";
import { useProviderDirectory } from "./provider-directory";
import { PersonPicker } from "./access-people";
import { type Api, type Decision, type Grant, type Permission, type PersonRef, type Role, type RoleDetail, type VersionDetail, PLATFORM, formatDate, whereLabel } from "./access-model";

const actors = ["GOVERNANCE", "PRACTICE_OPERATIONS", "CONSULTANT", "ASSOCIATE_DOCTOR", "CLINICAL_SUPPORT", "COORDINATOR", "OPERATIONS", "FINANCE", "SERVICE"];
const channels = ["ADMIN_WEB", "STAFF_WEB", "CONSULTANT_WEB", "CONSULTANT_MOBILE", "PRACTICE_MOBILE", "API"];
const relationships = ["MANAGES", "ASSISTS", "SUPERVISES", "COORDINATES", "ASSIGNED_TO", "VERIFIES"];
const identity = (g: Grant) => JSON.stringify(g);

type Props = { locale: Locale; api: Api; can: (k: string) => boolean; roles: Role[]; permissions: Permission[]; label: (k: string) => string; run: (w: () => Promise<void>) => Promise<void>; busy: boolean; setNotice: (s: string) => void; reloadRoles: () => Promise<void>; userSubject: string | undefined; page: number; setPage: (n: number) => void; render: (body: ReactNode, actions?: ReactNode) => ReactNode };

function statusTone(status: string): "success" | "warning" | "neutral" { return status === "PUBLISHED" ? "success" : status === "RETIRED" ? "neutral" : "warning"; }

/** Roles: what each role is for, whether it is in use, and whether a change is being prepared. Versions are governance detail. */
export function RolesView(props: Props) {
  const { locale, api, can, roles, run, busy, render, page, setPage } = props;
  const t = accessCopy[locale]; const ar = locale === "ar";
  const [detail, setDetail] = useState<RoleDetail | null>(null); const [query, setQuery] = useState("");
  const [wizard, setWizard] = useState<{ detail: RoleDetail | null; base?: VersionDetail } | null>(null);
  const loadRole = async (id: string) => { const d = await api<RoleDetail>("/roles/" + id); setDetail(d); return d; };
  if (wizard) return <RoleWizard {...props} initial={wizard.detail} base={wizard.base} onClose={async (d) => { setWizard(null); if (d) setDetail(await api<RoleDetail>("/roles/" + d.role.id)); await props.reloadRoles(); }} />;
  if (detail) return <RoleDetailView {...props} detail={detail} onBack={() => setDetail(null)} onReload={() => loadRole(detail.role.id)} onEdit={(d, base) => setWizard({ detail: d, base })} />;
  const list = roles.filter((r) => (roleLabel(r, locale) + " " + r.name + " " + r.purpose).toLowerCase().includes(query.toLowerCase()));
  return render(<>
    <div className="cc-filterbar"><label>{t.search}<input value={query} onChange={(e) => setQuery(e.target.value)} type="search" /></label></div>
    {!roles.length ? <EmptyState title={t.empty} /> : <ul className="ag-role-list">{list.map((r) => (
      <li key={r.id}><button className="ag-role-link" onClick={() => void run(async () => { await loadRole(r.id); })}>
        <span><strong>{roleLabel(r, locale)}</strong><small>{ar && r.systemTemplate ? "قالب مسؤوليات قابل للتهيئة ضمن نطاق وصول محدد" : r.purpose}</small>
          <span className="ag-role-status">
            {r.currentVersion != null ? <StatusBadge tone="success">{ar ? "قيد الاستخدام" : "In use"}</StatusBadge> : r.currentVersion === null ? <StatusBadge tone="neutral">{ar ? "غير منشور" : "Not published"}</StatusBadge> : null}
            {r.draftStatus && <StatusBadge tone="warning">{r.draftStatus === "VALIDATED" ? (ar ? "تغيير جاهز للنشر" : "Change ready to publish") : (ar ? "تغيير قيد الإعداد" : "Change in progress")}</StatusBadge>}
            {r.currentVersion != null && <small className="ag-version-meta">{ar ? `الإصدار ${r.currentVersion}` : `Version ${r.currentVersion}`}</small>}
          </span></span>
        <span aria-hidden>{ar ? "←" : "→"}</span></button></li>))}</ul>}
    {(page > 0 || roles.length >= 100) && <div className="cc-form-actions"><button className="cc-secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>{t.previous}</button><button className="cc-secondary" disabled={roles.length < 100} onClick={() => setPage(page + 1)}>{t.next}</button></div>}
  </>, can("access.role.create") ? <button disabled={busy} onClick={() => setWizard({ detail: null })}><Plus size={16} aria-hidden />{t.newRole}</button> : undefined);
}

function RoleDetailView({ locale, api, can, permissions, label, run, busy, render, detail, onBack, onReload, onEdit }: Props & { detail: RoleDetail; onBack: () => void; onReload: () => Promise<RoleDetail>; onEdit: (d: RoleDetail, base?: VersionDetail) => void }) {
  const t = accessCopy[locale]; const ar = locale === "ar";
  const published = detail.versions.find((v) => v.version.status === "PUBLISHED");
  const draft = detail.versions.find((v) => ["DRAFT", "VALIDATED"].includes(v.version.status));
  const [selected, setSelected] = useState((published ?? detail.versions[0])?.version.id ?? "");
  const current = detail.versions.find((v) => v.version.id === selected) ?? published ?? detail.versions[0];
  const [retiring, setRetiring] = useState<VersionDetail | null>(null);
  const byScope = useMemo(() => Object.entries(Object.groupBy(current?.grants ?? [], (g) => g.scope)), [current]);
  const conflicts = useMemo(() => {
    const keys = new Set(current?.grants.map((g) => g.permission) ?? []);
    return [...new Set((current?.grants ?? []).flatMap((g) => permissions.find((p) => p.key === g.permission)?.conflicts ?? []))].filter((c) => !keys.has(c));
  }, [current, permissions]);
  const sensitive = (current?.grants ?? []).filter((g) => permissions.find((p) => p.key === g.permission)?.recentAuthentication);
  const future = (current?.grants ?? []).filter((g) => permissions.find((p) => p.key === g.permission && !p.executable));
  const editCopy = () => void run(async () => {
    const base = published ?? current;
    const d = await api<RoleDetail>("/roles/" + detail.role.id + "/drafts", "POST", { baseVersionId: base.version.id, reason: ar ? `نسخة للتعديل من الإصدار ${base.version.number}` : `Edit a copy of version ${base.version.number}` });
    onEdit(d, d.versions[0]);
  });
  const action = draft ? <button disabled={!can("access.role.edit_draft") || busy} onClick={() => onEdit(detail, draft)}>{ar ? "متابعة التغيير قيد الإعداد" : "Continue the prepared change"}</button>
    : current ? <button disabled={!can("access.role.edit_draft") || busy} onClick={editCopy}>{ar ? "تعديل نسخة" : "Edit a copy"}</button> : null;
  if (!current) return render(<><button className="cc-ghost" onClick={onBack}>{ar ? "→" : "←"} {t.close}</button><EmptyState title={t.empty} /></>);
  return render(<>
    <button className="cc-ghost" onClick={onBack}>{ar ? "→" : "←"} {t.close}</button>
    <div className="cc-section-head" style={{ marginTop: 10 }}><div><h2>{roleLabel(detail.role, locale)}</h2><p>{ar && detail.role.systemTemplate ? "قالب مسؤوليات قابل للتهيئة ضمن نطاق وصول محدد" : detail.role.purpose}</p></div><div className="cc-section-actions">{action}</div></div>
    <section className="ag-source" aria-labelledby="role-overview"><h3 id="role-overview">{ar ? "نظرة عامة" : "Overview"}</h3>
      <Facts items={[
        [ar ? "الحالة" : "Status", published ? (ar ? "قيد الاستخدام" : "In use") : (ar ? "غير منشور" : "Not published")],
        [ar ? "ساري منذ" : "In effect since", published?.version.effectiveFrom ? formatDate(published.version.effectiveFrom, locale) : "—"],
        [ar ? "تغيير قيد الإعداد" : "Change being prepared", draft ? businessLabel(draft.version.status, locale) : (ar ? "لا يوجد" : "None")],
        [ar ? "الوصف" : "Description", detail.role.description],
      ]} />
      {current.version.id !== published?.version.id && <p className="cc-notice cc-notice-info">{ar ? `تعرض هذه الصفحة الإصدار ${current.version.number} (${businessLabel(current.version.status, locale)}).` : `Showing version ${current.version.number} (${businessLabel(current.version.status, locale)}).`}</p>}
    </section>
    <section className="ag-source" aria-labelledby="role-allows"><h3 id="role-allows">{ar ? "ما يسمح به هذا الدور" : "What this role allows"}</h3>
      {!current.grants.length ? <p>{t.noGrants}</p> : <ul className="ag-capabilities">{current.grants.map((g, i) => <li key={i}><strong>{label(g.permission)}</strong><span>{whereLabel(g.scope, locale)}{g.relationship ? " · " + businessLabel(g.relationship, locale) : ""}</span></li>)}</ul>}
    </section>
    <section className="ag-source" aria-labelledby="role-where"><h3 id="role-where">{ar ? "أين يمكن أن ينطبق" : "Where it can apply"}</h3>
      <ul className="ag-plain">{byScope.map(([scope, grants]) => <li key={scope}><strong>{whereLabel(scope, locale)}</strong> — {ar ? `${grants?.length ?? 0} صلاحية` : `${grants?.length ?? 0} ${grants?.length === 1 ? "permission" : "permissions"}`}</li>)}</ul>
    </section>
    <section className="ag-source" aria-labelledby="role-restrictions"><h3 id="role-restrictions">{ar ? "القيود والتعارضات" : "Restrictions & conflicts"}</h3>
      <ul className="ag-plain">
        {conflicts.length > 0 && <li>{ar ? "لا يمكن الجمع مع: " : "Can't be combined with: "}{conflicts.map(label).join(" · ")}</li>}
        {sensitive.length > 0 && <li>{ar ? "تتطلب تسجيل دخول حديثًا: " : "Needs a recent sign-in: "}{sensitive.map((g) => label(g.permission)).join(" · ")}</li>}
        {future.length > 0 && <li>{ar ? "غير متاحة للاستخدام بعد: " : "Not usable yet: "}{future.map((g) => label(g.permission)).join(" · ")}</li>}
        <li>{ar ? "تتحقق المنصة من فصل المسؤوليات عند منح الدور لشخص." : "Separation of duties is checked whenever this role is given to someone."}</li>
      </ul>
    </section>
    <section className="ag-source" aria-labelledby="role-versions"><h3 id="role-versions">{ar ? "الإصدارات والسجل" : "Versions & history"}</h3>
      <p className="cc-meta">{ar ? "الإصدارات المنشورة لا تتغير. يُعد كل تغيير كإصدار جديد ويُفحص وينشره مراجع مستقل. يبقى كل شخص على الإصدار الذي مُنح له." : "Published versions never change. Each change is prepared as a new version, checked, and published by an independent reviewer. Everyone keeps the version they were given."}</p>
      <ul className="ag-versions">{detail.versions.map((v) => (
        <li key={v.version.id}>
          <button type="button" className="cc-ghost" aria-current={v.version.id === current.version.id ? "true" : undefined} onClick={() => setSelected(v.version.id)}>{ar ? `الإصدار ${v.version.number}` : `Version ${v.version.number}`}</button>
          <StatusBadge tone={statusTone(v.version.status)}>{businessLabel(v.version.status, locale)}</StatusBadge>
          {v.version.effectiveFrom && <span className="cc-meta">{ar ? "ساري من " : "From "}{formatDate(v.version.effectiveFrom, locale)}</span>}
          {v.version.status === "PUBLISHED" && can("access.role.retire") && <button type="button" className="cc-secondary cc-small cc-danger-button" onClick={() => setRetiring(v)}>{t.retire}<span aria-hidden>…</span></button>}
        </li>))}</ul>
    </section>
    <details className="cc-technical"><summary>{ar ? "متقدم" : "Advanced"}</summary>
      <TechnicalDetails locale={locale} items={[[t.actor, businessLabel(current.version.actorType, locale)], [t.channel, businessLabel(current.version.channel, locale)], [ar ? "مفتاح الدور" : "Role key", <code key="k" dir="ltr">{detail.role.key}</code>], [t.revision, String(current.version.revision)]]} />
    </details>
    {retiring && <RetireDialog locale={locale} api={api} detail={detail} version={retiring} onClose={() => setRetiring(null)} onRetired={async () => { setRetiring(null); await onReload(); }} />}
  </>);
}

/** Retiring is immediate for everyone on that version (AuthorizationService only honours PUBLISHED versions); the copy says so. */
function RetireDialog({ locale, api, detail, version, onClose, onRetired }: { locale: Locale; api: Api; detail: RoleDetail; version: VersionDetail; onClose: () => void; onRetired: () => Promise<void> }) {
  const ar = locale === "ar"; const t = accessCopy[locale];
  const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null);
  const title = ar ? `إيقاف الإصدار ${version.version.number} من ${roleLabel(detail.role, locale)}؟` : `Retire version ${version.version.number} of ${detail.role.name}?`;
  return (
    <FocusTrapDialog label={title} onClose={busy ? () => undefined : onClose}>
      <h2>{title}</h2>
      <p>{ar ? "كل شخص يعتمد وصوله على هذا الإصدار يفقد ما يسمح به فورًا، ولا يمكن منح هذا الإصدار بعد ذلك. لا يمكن التراجع عن الإيقاف؛ لاستعادة الوصول انشر إصدارًا جديدًا وامنحه." : "Everyone whose access uses this version loses what it allows immediately, and it can't be given again. Retiring can't be undone; to restore access, publish a new version and give it."}</p>
      {error ? <p role="alert" className="cc-issue">{ar ? "تعذّر إيقاف الإصدار. أعد التحميل وحاول مجددًا." : "The version couldn't be retired. Reload and try again."}</p> : null}
      <form onSubmit={(e) => { e.preventDefault(); if (!reason.trim()) return; setBusy(true); setError(null); void api("/roles/" + detail.role.id + "/versions/" + version.version.id + "/retire", "POST", { revision: version.version.revision, reason: reason.trim() }).then(onRetired).catch(setError).finally(() => setBusy(false)); }}>
        <Field label={t.reason} required><input maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <div className="cc-form-actions"><button className="cc-danger-button" disabled={busy || !reason.trim()}>{t.retire}</button><button type="button" className="cc-secondary" disabled={busy} onClick={onClose}>{ar ? "إلغاء" : "Cancel"}</button></div>
      </form>
    </FocusTrapDialog>
  );
}

/**
 * Role wizard: purpose → permissions → where it applies → restrictions & checks → review & publish. Saving never
 * publishes. Draft saves and checks record a change note (prefilled, editable under a disclosure); publishing asks for
 * its own governance reason. The maker cannot publish their own draft (the backend enforces it; this says so first).
 */
function RoleWizard({ locale, api, can, roles, permissions, label, run, busy, setNotice, userSubject, render, initial, base, onClose }: Props & { initial: RoleDetail | null; base?: VersionDetail; onClose: (d: RoleDetail | null) => Promise<void> }) {
  const t = accessCopy[locale]; const ar = locale === "ar";
  const [detail, setDetail] = useState<RoleDetail | null>(initial);
  const [versionId, setVersionId] = useState(base?.version.id ?? "");
  const current = detail?.versions.find((v) => v.version.id === versionId);
  const published = detail?.versions.find((v) => v.version.status === "PUBLISHED");
  const [step, setStep] = useState(0); const [grants, setGrants] = useState<Grant[]>(base?.grants ?? []);
  const [name, setName] = useState(initial?.role.name ?? ""); const [description, setDescription] = useState(initial?.role.description ?? ""); const [purpose, setPurpose] = useState(initial?.role.purpose ?? "");
  const [actorType, setActorType] = useState(base?.version.actorType ?? "GOVERNANCE"); const [channel, setChannel] = useState(base?.version.channel ?? "ADMIN_WEB"); const [template, setTemplate] = useState("");
  const [note, setNote] = useState(ar ? "تحديث مسودة الدور" : "Role draft updated"); const [publishReason, setPublishReason] = useState(""); const [effectiveDate, setEffectiveDate] = useState("");
  const [validation, setValidation] = useState<string[]>([]);
  const [simPerson, setSimPerson] = useState<PersonRef | null>(null); const [simulation, setSimulation] = useState<Decision | null>(null); const [simulationPermission, setSimulationPermission] = useState("");
  const directory = useProviderDirectory(can("provider.view"));
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [step]);
  const reload = async (roleId: string, keep: string) => { const d = await api<RoleDetail>("/roles/" + roleId); setDetail(d); setVersionId(keep); return d; };
  const toggle = (p: Permission, enabled: boolean) => {
    if (!enabled) { setGrants(grants.filter((g) => g.permission !== p.key)); return; }
    const next = [...grants]; const scope = p.scopes[0]; const relationship = scope === "MANAGED_CLINICIANS" ? "MANAGES" : null;
    const include = (key: string) => { if (next.some((g) => g.permission === key && g.scope === scope)) return; next.push({ permission: key, scope, relationship }); permissions.find((x) => x.key === key)?.dependencies.forEach(include); };
    include(p.key); setGrants(next); if (p.dependencies.length) setNotice(t.dependency);
  };
  const updateScope = (index: number, scope: string) => setGrants(grants.map((g, i) => (i === index ? { ...g, scope, relationship: scope === "MANAGED_CLINICIANS" ? "MANAGES" : null } : g)));
  const saveDraft = async () => {
    let d = detail; let v = current;
    if (!d) { d = await api<RoleDetail>("/roles", "POST", { name, description, purpose, actorType, channel }); setDetail(d); v = d.versions[0]; setVersionId(v.version.id); }
    if (!v) return;
    const saved = await api<VersionDetail>("/roles/" + d.role.id + "/versions/" + v.version.id, "PUT", { revision: v.version.revision, grants, reason: note.trim() });
    await reload(d.role.id, saved.version.id); setNotice(t.saved); setValidation([]);
  };
  const validate = async () => {
    if (!detail || !current) return;
    const result = await api<{ valid: boolean; errors: string[]; warnings: string[] }>("/roles/" + detail.role.id + "/versions/" + current.version.id + "/validate", "POST", { revision: current.version.revision, reason: note.trim() });
    setValidation(result.errors.map((e) => { const [code, key] = e.split(":"); return (code === "MAKER_CHECKER_SEPARATION_REQUIRED" ? t.independent : code === "PROHIBITED_COMBINATION" ? (ar ? "صلاحيتان لا يمكن الجمع بينهما" : "Two permissions that can't be combined") : code === "DEPENDENCY_REQUIRED" ? (ar ? "صلاحية داعمة مطلوبة" : "A supporting permission is required") : code === "MANAGES_RELATIONSHIP_REQUIRED" ? (ar ? "يتطلب علاقة إدارة" : "Needs the Manages relationship") : (ar ? "تحقق من النطاق والتوافق" : "Check where it applies and compatibility")) + (key ? " — " + label(key) : ""); }));
    setNotice(result.valid ? t.valid : t.invalid); await reload(detail.role.id, current.version.id);
  };
  const dirty = !!current && JSON.stringify(current.grants) !== JSON.stringify(grants);
  const sensitive = grants.filter((g) => ["HIGH", "CRITICAL"].includes(permissions.find((p) => p.key === g.permission)?.risk ?? ""));
  const maker = !!current && current.version.createdBy === userSubject;
  const steps = [ar ? "الغرض من الدور" : "Role purpose", ar ? "الصلاحيات" : "Permissions", ar ? "أين ينطبق" : "Where it applies", ar ? "القيود والفحص" : "Restrictions & checks", ar ? "المراجعة والنشر" : "Review & publish"];
  const preview = <section className="ag-preview" aria-label={t.preview}><h3>{t.preview}</h3><p><CheckIcon size={16} aria-hidden /> {t.can}</p><ul>{grants.map((g, i) => <li key={i}>{label(g.permission)} · {whereLabel(g.scope, locale)}{g.relationship ? " · " + businessLabel(g.relationship, locale) : ""}</li>)}</ul>{!grants.length && <p>{t.noGrants}</p>}<p><Minus size={16} aria-hidden /> {t.cannot}</p></section>;
  return render(<>
    <button className="cc-ghost" disabled={busy} onClick={() => void onClose(detail)}>{ar ? "→" : "←"} {t.close}</button>
    <ol className="ag-steps" aria-label={detail ? (ar ? "خطوات تعديل الدور" : "Role change steps") : t.newRole}>{steps.map((s, i) => <li key={s}><button type="button" aria-current={step === i ? "step" : undefined} onClick={() => setStep(i)}>{i + 1}. {s}</button></li>)}</ol>
    <div className="ag-editor"><form onSubmit={(e) => { e.preventDefault(); void run(saveDraft); }}><h2 ref={heading} tabIndex={-1}>{step + 1}. {steps[step]}</h2>
      {step === 0 && <>
        <label>{t.name}<input required maxLength={160} disabled={!!detail} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>{t.description}<textarea required maxLength={500} disabled={!!detail} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <label>{t.purpose}<textarea required maxLength={500} disabled={!!detail} value={purpose} onChange={(e) => setPurpose(e.target.value)} /></label>
        {!detail && <label>{t.base} <span className="cc-optional">({ar ? "اختياري" : "optional"})</span><select value={template} onChange={(e) => { setTemplate(e.target.value); if (e.target.value) void run(async () => { const d = await api<RoleDetail>("/roles/" + e.target.value); const v = d.versions.find((x) => x.version.status === "PUBLISHED"); if (v) { setGrants(v.grants); setActorType(v.version.actorType); setChannel(v.version.channel); } }); }}><option value="">{t.choose}</option>{roles.map((r) => <option value={r.id} key={r.id}>{roleLabel(r, locale)}</option>)}</select></label>}
      </>}
      {step === 1 && <>
        <p className="cc-meta">{ar ? "الصلاحيات يحددها فريق الهندسة؛ يمكن اختيارها هنا فقط. " : "Permissions are defined by engineering; here they can only be chosen. "}<Link href={ccHref(locale, "/access/permissions")} target="_blank" rel="noopener">{ar ? "مرجع الصلاحيات (في علامة تبويب جديدة)" : "Permission reference (opens in a new tab)"}</Link></p>
        {Object.entries(Object.groupBy(permissions, (p) => p.family)).map(([family, items]) => <fieldset key={family}><legend>{familyLabel(family, locale)}</legend>{items?.map((p) => <label className="ag-check" key={p.key}><input type="checkbox" checked={grants.some((g) => g.permission === p.key)} onChange={(e) => toggle(p, e.target.checked)} /><span>{permissionLabel(p, locale)}<small>{businessLabel(p.risk, locale)}{!p.executable ? " · " + t.future : ""}</small></span></label>)}</fieldset>)}
        {sensitive.length > 0 && <div className="cc-notice cc-notice-info"><div><p><strong>{ar ? "صلاحيات حساسة مختارة" : "Sensitive permissions selected"}</strong></p><ul>{sensitive.map((g, i) => <li key={i}>{label(g.permission)}</li>)}</ul><p>{t.recent}</p></div></div>}
      </>}
      {step === 2 && <>
        {!grants.length && <p>{t.noGrants}</p>}
        {grants.map((g, i) => <fieldset key={i}><legend>{label(g.permission)}</legend>
          <label>{ar ? "أين ينطبق" : "Where it applies"}<select value={g.scope} onChange={(e) => updateScope(i, e.target.value)}>{permissions.find((p) => p.key === g.permission)?.scopes.map((s) => <option key={s} value={s}>{whereLabel(s, locale)}</option>)}</select></label>
          <label>{t.relationship}<select value={g.relationship ?? ""} onChange={(e) => setGrants(grants.map((v, n) => (n === i ? { ...v, relationship: e.target.value || null } : v)))}><option value="">{t.none}</option>{relationships.map((r) => <option key={r} value={r}>{businessLabel(r, locale)}</option>)}</select></label>
        </fieldset>)}
        <details className="cc-technical"><summary>{ar ? "متقدم: المشاركة في الرحلة وقناة الوصول" : "Advanced: journey participation and channel"}</summary>
          <label>{t.actor}<select disabled={!!detail} value={actorType} onChange={(e) => setActorType(e.target.value)}>{actors.map((a) => <option key={a} value={a}>{businessLabel(a, locale)}</option>)}</select></label>
          <label>{t.channel}<select disabled={!!detail} value={channel} onChange={(e) => setChannel(e.target.value)}>{channels.map((a) => <option key={a} value={a}>{businessLabel(a, locale)}</option>)}</select></label>
        </details>
      </>}
      {step === 3 && <>
        <p>{t.conflicts} {t.pending}</p>
        <button type="button" disabled={busy || dirty || !current || !note.trim() || !can("access.role.edit_draft")} onClick={() => void run(validate)}>{ar ? "فحص الإعداد" : "Check the configuration"}</button>
        {dirty && <p className="cc-meta">{ar ? "احفظ المسودة قبل الفحص." : "Save the draft before checking it."}</p>}
        {current?.version.status === "VALIDATED" && !dirty && <p className="cc-meta"><StatusBadge tone="success">{ar ? "تم الفحص" : "Checked"}</StatusBadge></p>}
        <details className="cc-technical ag-simulation"><summary>{ar ? "متقدم: جرّب المسودة على شخص" : "Advanced: try the draft on a person"}</summary>
          <p className="cc-meta">{ar ? "تعرض المحاكاة ما سيحدث لو مُنح هذا الإصدار، دون تغيير أي وصول فعلي." : "Simulation shows what would happen if this version were given, without changing any real access."}</p>
          {!simPerson ? <PersonPicker locale={locale} directory={directory} compact label={ar ? "الشخص" : "Person"} onSelect={setSimPerson} />
            : <p><strong><bdi>{simPerson.name ?? simPerson.subject}</bdi></strong> <button type="button" className="cc-ghost cc-small" onClick={() => { setSimPerson(null); setSimulation(null); }}>{ar ? "تغيير" : "Change"}</button></p>}
          <label>{ar ? "الإجراء" : "Action"}<select value={simulationPermission} onChange={(e) => setSimulationPermission(e.target.value)}><option value="">{ar ? "اختر إجراءً" : "Choose an action"}</option>{grants.map((g) => <option key={g.permission + g.scope} value={g.permission}>{label(g.permission)}</option>)}</select></label>
          <button type="button" className="cc-secondary" disabled={busy || dirty || !current || !simPerson || !simulationPermission || !can("access.role.simulate")} onClick={() => void run(async () => setSimulation(await api<Decision>("/simulate", "POST", { subject: simPerson!.subject, permission: simulationPermission, resourceType: "PLATFORM", resourceId: PLATFORM, draftVersionId: current?.version.id })))}>{t.simulate}</button>
          <div aria-live="polite">{simulation && <p><span className={simulation.allowed ? "ag-allow" : "ag-deny"}>{simulation.allowed ? <CheckIcon size={16} aria-hidden /> : <Minus size={16} aria-hidden />} {simulation.allowed ? t.allowed : t.deniedAction}</span> — {businessLabel(simulation.reason, locale)}</p>}</div>
        </details>
      </>}
      {step === 4 && <>
        <p>{t.independent}</p>
        <h3>{t.changes}</h3>
        <ul>{grants.filter((g) => !published?.grants.some((old) => identity(old) === identity(g))).map((g, i) => <li key={i}>{t.added}: {label(g.permission)} · {whereLabel(g.scope, locale)}</li>)}{published?.grants.filter((g) => !grants.some((next) => identity(next) === identity(g))).map((g, i) => <li key={"r" + i}>{t.removed}: {label(g.permission)}</li>)}</ul>
        {maker ? <p className="cc-notice cc-notice-info">{ar ? "أعددت هذه المسودة، لذا يجب أن ينشرها مراجع مستقل مخوّل." : "You prepared this draft, so another authorized reviewer must publish it."}</p> : <>
          <label>{t.effectiveDate}<input type="datetime-local" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} /></label>
          <Field label={ar ? "سبب النشر" : "Reason for publishing"} required hint={ar ? "يُسجَّل في سجل التدقيق." : "Recorded in the audit log."}><input maxLength={500} value={publishReason} onChange={(e) => setPublishReason(e.target.value)} /></Field>
          <button type="button" disabled={busy || dirty || current?.version.status !== "VALIDATED" || !publishReason.trim() || !effectiveDate || !can("access.role.publish")} onClick={() => void run(async () => { if (!detail || !current) return; await api("/roles/" + detail.role.id + "/versions/" + current.version.id + "/publish", "POST", { revision: current.version.revision, reason: publishReason.trim(), effectiveFrom: new Date(effectiveDate).toISOString() }); setNotice(ar ? "نُشر الإصدار." : "Version published."); await onClose(detail); })}>{t.publish}</button>
          {current?.version.status !== "VALIDATED" && <p className="cc-meta">{ar ? "افحص الإعداد في الخطوة ٤ قبل النشر." : "Check the configuration in step 4 before publishing."}</p>}
        </>}
      </>}
      {validation.length > 0 && <div role="alert" className="cc-issue"><p><strong>{t.invalid}</strong></p><ul>{validation.map((v, i) => <li key={i}>{v}</li>)}</ul></div>}
      <details className="cc-technical"><summary>{ar ? "ملاحظة التغيير (تُسجَّل في سجل التدقيق)" : "Change note (recorded in the audit log)"}</summary>
        <label>{t.reason}<input required maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </details>
      <div className="cc-wizard-nav">
        <button type="button" className="cc-secondary" disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>{t.previous}</button>
        <div className="cc-push">
          <button className="cc-secondary" disabled={busy || !note.trim() || !name || !purpose || !description || !can(detail ? "access.role.edit_draft" : "access.role.create")}>{t.save}</button>
          {step < 4 && <button type="button" disabled={busy} onClick={() => setStep(step + 1)}>{t.next}</button>}
        </div>
      </div>
    </form>{preview}</div>
  </>);
}

export function PermissionsView({ locale, permissions, label }: { locale: Locale; permissions: Permission[]; label: (k: string) => string }) {
  const t = accessCopy[locale]; const ar = locale === "ar";
  const [query, setQuery] = useState("");
  const list = permissions.filter((p) => `${permissionLabel(p, locale)} ${familyLabel(p.family, locale)}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <p className="cc-meta">{t.futureHint} {ar ? "لا تُضاف صلاحيات جديدة من هنا؛ يحددها فريق الهندسة." : "New permissions can't be added here; engineering defines them."}</p>
    <div className="cc-filterbar"><label>{ar ? "ابحث عن صلاحية" : "Find a permission"}<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} /></label></div>
    {Object.entries(Object.groupBy(list, (p) => p.family)).map(([family, items]) => <section key={family}><h2>{familyLabel(family, locale)}</h2><ul className="ag-capabilities">{items?.map((p) => <li key={p.key}><div><strong>{permissionLabel(p, locale)}</strong><p>{p.scopes.map((s) => whereLabel(s, locale)).join(" · ")}</p><details><summary>{t.advanced}</summary><p>{t.technical}: <code dir="ltr">{p.key}</code></p><p>{p.dependencies.map(label).join(" · ")}</p></details></div><span className="ag-badge">{businessLabel(p.risk, locale)}{!p.executable && <small>{t.future}</small>}</span></li>)}</ul></section>)}
    {!list.length && <EmptyState title={t.empty} />}
  </>;
}
