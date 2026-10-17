"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { CareAreaIcon, SYSTEM_STYLES } from "@/components/care-areas/CareAreaIcon";
import { careAreaMeta } from "@/lib/care-area-catalog";
import { getDictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { useControlCenterAccess } from "./control-center-access";
import { useAdminApi } from "./admin-api";
import { EmptyState, ErrorNotice, StatusBadge, SuccessNotice } from "./cc-ui";
import { addConsultantHref, consultantHref, credentialStatus, setupStatus, type Badge, type Consultant, type SetupBucket } from "./consultant-model";
import { careAreaLabel } from "./admin-labels";

type PublicProfileSummary = {
  practitionerId: string; slug: string | null; published: boolean; sortOrder: number; version: number;
  affiliationReady: boolean; priceListReady: boolean;
};

/**
 * Consultants — every Consultant with their credential status, setup and case eligibility as separate facts. Readable
 * with CREDENTIAL_READ; adding one needs CONSULTANT_ONBOARD. Management happens on the Consultant's page.
 */
export function ConsultantDirectory({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const api = useAdminApi();
  const canRead = access.canAny(["CREDENTIAL_READ", "CONSULTANT_PROFILE_MANAGE"]);
  const canAdd = access.can("CONSULTANT_ONBOARD");
  const [rows, setRows] = useState<Consultant[] | null>(null);
  const [profiles, setProfiles] = useState<PublicProfileSummary[]>([]);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(async () => { setError(null); try {
    const [consultants, publicProfiles] = await Promise.all([
      api<Consultant[]>("/admin/practitioners"), api<PublicProfileSummary[]>("/control-center/consultants/public-profiles"),
    ]);
    setRows(consultants); setProfiles(publicProfiles);
  } catch (e) { setError(e); setRows([]); setProfiles([]); } }, [api]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the Control Center load-on-mount idiom
  useEffect(() => { if (user && canRead) void load(); }, [user, canRead, load]);
  const addLink = canAdd ? <Link className="cc-primary" href={addConsultantHref(locale)}><Plus size={16} aria-hidden />{ar ? "إضافة استشاري" : "Add consultant"}</Link> : undefined;
  const title = ar ? "الاستشاريون" : "Consultants";
  const shell = (body: React.ReactNode) => <ControlCenterShell locale={locale} active="consultants" title={title} intro={ar ? "كل الاستشاريين: حالة الاعتماد والإعداد، وهل يمكنهم استقبال الحالات." : "Every consultant: credential and setup status, and whether they can receive cases."} actions={addLink}>{body}</ControlCenterShell>;
  if (authLoading || access.loading) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (!user) return shell(<button onClick={() => void signIn()}>{ar ? "تسجيل الدخول الآمن" : "Sign in securely"}</button>);
  if (!canRead) return shell(<EmptyState title={ar ? "ليس لديك وصول إلى الاستشاريين" : "You don't have access to consultants"} />);
  if (rows === null) return shell(<p role="status">{ar ? "جارٍ تحميل الاستشاريين…" : "Loading consultants…"}</p>);
  if (error) return shell(<ErrorNotice error={error} locale={locale} action="load" onRetry={() => void load()} />);
  if (!rows.length) return shell(<EmptyState title={ar ? "لا يوجد استشاريون بعد" : "No consultants yet"} body={canAdd ? (ar ? "أضف أول استشاري لبدء إعداده." : "Add your first consultant to begin setup.") : undefined} action={addLink} />);
  return shell(<DirectoryList locale={locale} rows={rows} profiles={profiles} api={api} canManage={access.can("CONSULTANT_PROFILE_MANAGE")} reload={load} />);
}

function DirectoryList({ locale, rows, profiles, api, canManage, reload }: { locale: Locale; rows: Consultant[]; profiles: PublicProfileSummary[]; api: ReturnType<typeof useAdminApi>; canManage: boolean; reload: () => Promise<void> }) {
  const ar = locale === "ar";
  const copy = getDictionary(locale).controlCenterConsultantProfiles;
  const [query, setQuery] = useState(""); const [setup, setSetup] = useState<SetupBucket | "">("");
  const [busy, setBusy] = useState<string | null>(null); const [notice, setNotice] = useState(""); const [actionError, setActionError] = useState<unknown>(null);
  const q = query.trim().toLowerCase();
  const unnamed = ar ? "استشاري بلا اسم مسجّل" : "Unnamed consultant";
  const byId = new Map(profiles.map((profile) => [profile.practitionerId, profile]));
  const shown = rows
    .filter((c) => (!setup || setupStatus(c, locale).bucket === setup) && (!q || `${c.displayName ?? ""} ${c.specialty ?? ""}`.toLowerCase().includes(q)))
    .sort((a, b) => (byId.get(a.id)?.sortOrder ?? Number.MAX_SAFE_INTEGER) - (byId.get(b.id)?.sortOrder ?? Number.MAX_SAFE_INTEGER) || (a.displayName ?? "").localeCompare(b.displayName ?? "", locale));
  const filtered = !!(q || setup);
  const groups = [...new Set(shown.map((row) => row.careCategory ?? ""))].sort((a, b) => careAreaLabel(a, locale).localeCompare(careAreaLabel(b, locale), locale));
  const move = async (row: Consultant, direction: -1 | 1) => {
    const group = shown.filter((item) => item.careCategory === row.careCategory); const index = group.findIndex((item) => item.id === row.id);
    const other = group[index + direction]; const currentProfile = byId.get(row.id); const otherProfile = other ? byId.get(other.id) : undefined;
    if (!currentProfile || !otherProfile) return;
    setBusy(row.id); setActionError(null); setNotice("");
    try {
      await api("/control-center/consultants/public-profiles/order", { method: "PATCH", body: { items: [
        { practitionerId: currentProfile.practitionerId, version: currentProfile.version, sortOrder: otherProfile.sortOrder },
        { practitionerId: otherProfile.practitionerId, version: otherProfile.version, sortOrder: currentProfile.sortOrder },
      ] } });
      await reload(); setNotice(copy.directory.orderSaved);
    } catch (cause) { setActionError(cause); } finally { setBusy(null); }
  };
  return (
    <>
      <section className="cc-directory-overview" aria-labelledby="directory-overview-title"><div><h2 id="directory-overview-title">{copy.directory.overview}</h2><p>{copy.directory.intro}</p></div><strong>{fill(copy.directory.consultantCount, { count: rows.length })}</strong></section>
      <SuccessNotice>{notice}</SuccessNotice><ErrorNotice error={actionError} locale={locale} />
      <div className="cc-filterbar" role="search" aria-label={ar ? "تصفية الاستشاريين" : "Filter consultants"}>
        <label>{ar ? "بحث" : "Search"}<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={ar ? "الاسم أو التخصص" : "Name or specialty"} /></label>
        <label>{ar ? "الإعداد" : "Setup"}<select value={setup} onChange={(e) => setSetup(e.target.value as SetupBucket | "")}><option value="">{ar ? "الكل" : "All"}</option><option value="progress">{ar ? "قيد التنفيذ" : "In progress"}</option><option value="complete">{ar ? "مكتمل" : "Complete"}</option><option value="inactive">{ar ? "موقوف أو غير نشط" : "Suspended or inactive"}</option></select></label>
      </div>
      <p className="cc-meta" role="status" aria-live="polite">{filtered ? (ar ? `${shown.length} من ${rows.length} استشاري` : `${shown.length} of ${rows.length} consultants`) : (ar ? `${rows.length} استشاري` : `${rows.length} consultant${rows.length === 1 ? "" : "s"}`)}</p>
      {!shown.length ? <EmptyState title={ar ? "لا يوجد استشاريون يطابقون عوامل التصفية هذه." : "No consultants match these filters."} action={<button type="button" className="cc-secondary" onClick={() => { setQuery(""); setSetup(""); }}>{ar ? "مسح عوامل التصفية" : "Clear filters"}</button>} /> : groups.map((careArea) => {
        const group = shown.filter((row) => (row.careCategory ?? "") === careArea); const meta = careAreaMeta(careArea); const style = meta ? SYSTEM_STYLES[meta.system] : undefined;
        return <section key={careArea || "unassigned"} className="cc-consultant-group" aria-labelledby={`care-${careArea || "unassigned"}`}>
          <header className={style?.soft}><span className={style?.line}>{meta ? <CareAreaIcon name={meta.icon} size={22} strokeWidth={1.7} /> : null}</span><div><h2 id={`care-${careArea || "unassigned"}`}>{careAreaLabel(careArea, locale)}</h2><p>{fill(copy.directory.consultantCount, { count: group.length })}</p></div></header>
          <ul className="cc-consultant-readiness-list">{group.map((row, index) => {
            const profile = byId.get(row.id); const profileBadge: Badge = profile?.published ? { label: copy.published, tone: "success" } : profile?.slug ? { label: copy.draft, tone: "warning" } : { label: copy.notStarted, tone: "neutral" };
            return <li key={row.id}><div className="cc-consultant-identity"><Link className="cc-row-title" href={consultantHref(locale, row.id)}><bdi>{row.displayName?.trim() || unnamed}</bdi></Link><span className="cc-row-sub">{[row.specialty, row.subspecialty].filter(Boolean).join(" · ")}</span></div>
              <div className="cc-readiness-strip" aria-label={copy.readiness.title}>
                <Fact label={copy.readiness.profile} badge={profileBadge} /><Fact label={copy.readiness.credentialing} badge={credentialStatus(row, locale)} />
                <Fact label={copy.readiness.availability} badge={row.availabilityStatus === "AVAILABLE" ? { label: copy.readiness.available, tone: "success" } : { label: copy.readiness.unavailable, tone: "warning" }} />
                <Fact label={copy.readiness.affiliation} badge={profile?.affiliationReady ? { label: copy.readiness.ready, tone: "success" } : { label: copy.readiness.notReady, tone: "warning" }} />
                <Fact label={copy.readiness.prices} badge={profile?.priceListReady ? { label: copy.readiness.ready, tone: "success" } : { label: copy.readiness.notReady, tone: "warning" }} />
              </div>
              {canManage ? <div className="cc-order-actions"><button type="button" className="cc-secondary cc-icon-button" disabled={busy === row.id || index === 0 || !profile} aria-label={`${copy.directory.moveUp}: ${row.displayName ?? unnamed}`} onClick={() => void move(row, -1)}><ArrowUp size={16} aria-hidden /></button><button type="button" className="cc-secondary cc-icon-button" disabled={busy === row.id || index === group.length - 1 || !profile} aria-label={`${copy.directory.moveDown}: ${row.displayName ?? unnamed}`} onClick={() => void move(row, 1)}><ArrowDown size={16} aria-hidden /></button></div> : null}
            </li>;
          })}</ul>
        </section>;
      })}
    </>
  );
}

const fill = (value: string, values: Record<string, string | number>) => value.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

function Fact({ label, badge }: { label: string; badge: Badge }) {
  return <span className="cc-clinician-fact"><span className="cc-clinician-fact-label">{label}</span><StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>{badge.detail && <span className="cc-row-sub">{badge.detail}</span>}</span>;
}
