"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { useControlCenterAccess } from "./control-center-access";
import { EmptyState, ErrorNotice, StatusBadge } from "./cc-ui";
import { addClinicianHref, buildDirectory, clinicianTypeLabel, engagementLabel, useClinicianDirectory, type Badge, type ClinicianEntry, type Engagement, type SetupBucket } from "./clinician-model";

/**
 * Providers › Clinicians — one directory for every clinician, whichever way they work with RehletShifaa. Each entry
 * states its engagement and keeps credential status, setup status and case eligibility as separate facts. Management
 * happens on the clinician's page; the only row action is "Continue setup", and only while setup is in progress.
 */
export function ClinicianDirectory({ locale, initialEngagement }: { locale: Locale; initialEngagement?: Engagement }) {
  const ar = locale === "ar";
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const canProvider = access.can("provider.view"), canDirect = access.legacy.admin;
  const data = useClinicianDirectory(!access.loading && canProvider, !access.loading && canDirect);
  const canAdd = access.can("provider.clinician.invite") || access.legacy.canManage;
  const addLink = canAdd ? <Link className="cc-primary" href={addClinicianHref(locale)}><Plus size={16} aria-hidden />{ar ? "إضافة طبيب" : "Add clinician"}</Link> : undefined;
  const title = ar ? "الأطباء" : "Clinicians";
  const shell = (body: React.ReactNode) => <ControlCenterShell locale={locale} active="consultants" title={title} intro={ar ? "كل الأطباء في مكان واحد: كيف يعمل كل منهم مع رحلة شفاء، وحالة اعتماداته وإعداده، وهل يمكنه استقبال الحالات." : "Every clinician in one place: how each works with RehletShifaa, their credential and setup status, and whether they can receive cases."} actions={addLink}>{body}</ControlCenterShell>;
  if (authLoading || access.loading) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (!user) return shell(<button onClick={() => void signIn()}>{ar ? "تسجيل الدخول الآمن" : "Sign in securely"}</button>);
  if (!canProvider && !canDirect) return shell(<EmptyState title={ar ? "ليس لديك وصول إلى الأطباء" : "You don't have access to clinicians"} />);
  if (data.loading) return shell(<p role="status">{ar ? "جارٍ تحميل الأطباء…" : "Loading clinicians…"}</p>);
  const failed = <>
    {data.providerError ? <ErrorNotice error={data.providerError} locale={locale} action="load" onRetry={() => void data.reload()} /> : null}
    {data.directError ? <ErrorNotice error={data.directError} locale={locale} action="load" onRetry={() => void data.reload()} /> : null}
    {(data.providerError || data.directError) && !(data.providerError && data.directError) ? <p className="cc-meta">{data.providerError ? (ar ? "لم يُحمَّل أطباء الجهات الطبية؛ القائمة أدناه غير مكتملة." : "Clinicians in provider organizations couldn't be loaded; the list below is incomplete.") : (ar ? "لم يُحمَّل الأطباء المباشرون؛ القائمة أدناه غير مكتملة." : "Direct clinicians couldn't be loaded; the list below is incomplete.")}</p> : null}
  </>;
  const entries = buildDirectory(data.providerRows, data.directRows, locale);
  if (!entries.length) return shell(<>{failed}{!(data.providerError && data.directError) && <EmptyState title={ar ? "لا يوجد أطباء بعد" : "No clinicians yet"} body={canAdd ? (ar ? "أضف أول طبيب لبدء إعداده." : "Add your first clinician to begin setup.") : undefined} action={addLink} />}</>);
  return shell(<>{failed}<DirectoryList locale={locale} entries={entries} initialEngagement={initialEngagement} /></>);
}

const ALL = "";
function DirectoryList({ locale, entries, initialEngagement }: { locale: Locale; entries: ClinicianEntry[]; initialEngagement?: Engagement }) {
  const ar = locale === "ar";
  const [query, setQuery] = useState(""); const [engagement, setEngagement] = useState<string>(initialEngagement ?? ALL);
  const [org, setOrg] = useState(ALL); const [type, setType] = useState(ALL); const [setup, setSetup] = useState<SetupBucket | "">(ALL);
  const orgs = useMemo(() => Array.from(new Map(entries.map((e) => [e.organizationId ?? "direct", e.organizationName])).entries()), [entries]);
  const engagements = new Set(entries.map((e) => e.engagement)), types = new Set(entries.map((e) => e.clinicianType));
  const q = query.trim().toLowerCase();
  const rows = entries.filter((e) => (!engagement || e.engagement === engagement) && (!org || (e.organizationId ?? "direct") === org) && (!type || e.clinicianType === type) && (!setup || e.setup.bucket === setup)
    && (!q || `${e.name} ${e.organizationName} ${e.specialty ?? ""}`.toLowerCase().includes(q)));
  const filtered = !!(q || engagement || org || type || setup);
  const clear = () => { setQuery(""); setEngagement(ALL); setOrg(ALL); setType(ALL); setSetup(ALL); };
  return (
    <>
      <div className="cc-filterbar" role="search" aria-label={ar ? "تصفية الأطباء" : "Filter clinicians"}>
        <label>{ar ? "بحث" : "Search"}<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={ar ? "الاسم أو الجهة" : "Name or organization"} /></label>
        {engagements.size > 1 && <label>{ar ? "طريقة العمل" : "Engagement"}<select value={engagement} onChange={(e) => setEngagement(e.target.value)}><option value="">{ar ? "الكل" : "All"}</option><option value="direct">{engagementLabel("direct", locale)}</option><option value="provider">{engagementLabel("provider", locale)}</option></select></label>}
        {orgs.length > 1 && <label>{ar ? "الجهة" : "Organization"}<select value={org} onChange={(e) => setOrg(e.target.value)}><option value="">{ar ? "كل الجهات" : "All organizations"}</option>{orgs.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>}
        {types.size > 1 && <label>{ar ? "نوع الطبيب" : "Clinician type"}<select value={type} onChange={(e) => setType(e.target.value)}><option value="">{ar ? "الكل" : "All"}</option>{Array.from(types).map((k) => <option key={k} value={k}>{clinicianTypeLabel(k, locale)}</option>)}</select></label>}
        <label>{ar ? "الإعداد" : "Setup"}<select value={setup} onChange={(e) => setSetup(e.target.value as SetupBucket | "")}><option value="">{ar ? "الكل" : "All"}</option><option value="progress">{ar ? "قيد التنفيذ" : "In progress"}</option><option value="complete">{ar ? "مكتمل" : "Complete"}</option><option value="inactive">{ar ? "موقوف أو غير نشط" : "Suspended or inactive"}</option></select></label>
      </div>
      <p className="cc-meta" role="status" aria-live="polite">{filtered ? (ar ? `${rows.length} من ${entries.length} طبيب` : `${rows.length} of ${entries.length} clinicians`) : (ar ? `${entries.length} طبيب` : `${entries.length} clinician${entries.length === 1 ? "" : "s"}`)}</p>
      {!rows.length ? <EmptyState title={ar ? "لا يوجد أطباء يطابقون عوامل التصفية هذه." : "No clinicians match these filters."} action={<button type="button" className="cc-secondary" onClick={clear}>{ar ? "مسح عوامل التصفية" : "Clear filters"}</button>} /> : (
        <ul className="cc-list cc-clinician-list" aria-label={ar ? "الأطباء" : "Clinicians"}>
          <li className="cc-list-head" aria-hidden><span>{ar ? "الطبيب" : "Clinician"}</span><span>{ar ? "يعمل مع" : "Works with"}</span><span>{ar ? "الاعتمادات" : "Credentials"}</span><span>{ar ? "الإعداد" : "Setup"}</span><span>{ar ? "أهلية الحالات" : "Case eligibility"}</span><span /></li>
          {rows.map((e) => <DirectoryRow key={e.key} entry={e} locale={locale} />)}
        </ul>
      )}
    </>
  );
}

/** A labelled fact: the column heading is hidden visually on desktop, so each value carries its own label for screen readers and the stacked mobile card. */
function Fact({ label, badge }: { label: string; badge: Badge }) {
  return <span className="cc-clinician-fact"><span className="cc-clinician-fact-label">{label}</span><StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>{badge.detail && <span className="cc-row-sub">{badge.detail}</span>}</span>;
}

function DirectoryRow({ entry: e, locale }: { entry: ClinicianEntry; locale: Locale }) {
  const ar = locale === "ar";
  return (
    <li>
      <span>
        <Link className="cc-row-title" href={e.href}><bdi>{e.name}</bdi></Link>
        <span className="cc-row-sub">{[clinicianTypeLabel(e.clinicianType, locale), e.specialty].filter(Boolean).join(" · ")}</span>
      </span>
      <span>
        <span className="cc-clinician-fact-label">{ar ? "يعمل مع" : "Works with"}</span>
        <bdi className="cc-clinician-org">{e.organizationName}</bdi>
        <span className="cc-row-sub">{engagementLabel(e.engagement, locale)}</span>
        {e.alsoLinked?.map((l) => <span key={l.href} className="cc-row-sub">{ar ? "مرتبط أيضًا بـ " : "Also linked to "}<Link href={l.href}><bdi>{l.organizationName}</bdi></Link>{ar ? " (سجل مستورد)" : " (imported record)"}</span>)}
      </span>
      <Fact label={ar ? "الاعتمادات" : "Credentials"} badge={e.credentials} />
      <Fact label={ar ? "الإعداد" : "Setup"} badge={e.setup} />
      <Fact label={ar ? "أهلية الحالات" : "Case eligibility"} badge={e.eligibility} />
      <span className="cc-row-actions">{e.continueHref && <Link className="cc-secondary cc-small" href={e.continueHref} aria-label={(ar ? "متابعة الإعداد: " : "Continue setup: ") + e.name}>{ar ? "متابعة الإعداد" : "Continue setup"}</Link>}</span>
    </li>
  );
}
