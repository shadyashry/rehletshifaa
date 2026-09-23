"use client";

import { REAUTHENTICATION_REQUIRED, reauthenticationCopy, requestReauthentication } from "@/lib/reauthentication";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Users, Route as RouteIcon, ListChecks, FlaskConical, Inbox, History } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchAs } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { ccCopy } from "./control-center-copy";
import { coordCopy } from "./coordination-copy";
import type { CoordinationApi, Decision, QueueItem, Team } from "./coordination-types";
import { CoordinatorTeams } from "./CoordinatorTeams";
import { RoutingPreferences } from "./RoutingPreferences";
import { RoutingPolicy } from "./RoutingPolicy";
import { RoutingSimulation } from "./RoutingSimulation";
import { AssignmentQueue } from "./AssignmentQueue";
import { AssignmentAudit } from "./AssignmentAudit";

export type CoordinationTab = "overview" | "teams" | "preferences" | "policy" | "simulation" | "queue" | "audit";
class ApiCodeError extends Error { code?: string; constructor(message: string, code?: string) { super(message); this.code = code; } }

export function CareCoordinationWorkspace({ locale, orgId, initialTab }: { locale: Locale; orgId: string; initialTab?: CoordinationTab }) {
  const t = coordCopy[locale]; const cc = ccCopy[locale];
  const { user, loading: authLoading, signIn } = useAuth();
  const router = useRouter();

  const [can, setCan] = useState<Decision[]>([]);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<CoordinationTab>(initialTab ?? "overview");

  const allowed = useCallback((key: string) => can.some((d) => d.permission === key && d.allowed), [can]);

  const api: CoordinationApi = useCallback(async (path: string, method = "GET", body?: unknown): Promise<unknown> => {
    if (!user) throw new ApiCodeError(t.denied);
    const response = await apiFetchAs(user.access_token, `/admin/coordination/${orgId}` + path, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (data.code === REAUTHENTICATION_REQUIRED) { await requestReauthentication(signIn); throw new ApiCodeError(reauthenticationCopy[locale].required, data.code); }
      throw new ApiCodeError(data.message || (response.status === 403 ? t.denied : t.error), data.code);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : undefined;
  }, [user, t, signIn, orgId]);

  const refresh = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const decisions = await apiFetchAs(user.access_token, "/admin/access/me").then((r) => (r.ok ? r.json() : []));
      setCan(decisions);
      const list = await apiFetchAs(user.access_token, "/admin/coordination/organizations").then((r) => (r.ok ? r.json() : []));
      const mine = (list as { id: string; displayName: string }[]).find((o) => o.id === orgId);
      setOrgName(mine?.displayName ?? null);
      if (!mine) { setLoading(false); return; }
      const tasks: Promise<void>[] = [];
      if ((decisions as Decision[]).some((d) => d.permission === "assignment.team.view" && d.allowed)) tasks.push(api("/teams").then((r) => setTeams(r as Team[])));
      if ((decisions as Decision[]).some((d) => d.permission === "assignment.queue.manage" && d.allowed)) tasks.push(api("/queue").then((r) => setQueue(r as QueueItem[])));
      await Promise.all(tasks);
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setLoading(false); }
  }, [user, t.error, orgId, api]);
  useEffect(() => { void refresh(); }, [refresh]);

  const tabs = useMemo(() => ([
    { key: "overview" as const, label: t.tabOverview, icon: RouteIcon, visible: true },
    { key: "teams" as const, label: t.tabTeams, icon: Users, visible: allowed("assignment.team.view") },
    { key: "preferences" as const, label: t.tabPreferences, icon: ListChecks, visible: allowed("assignment.policy.view") },
    { key: "policy" as const, label: t.tabPolicy, icon: RouteIcon, visible: allowed("assignment.policy.view") },
    { key: "simulation" as const, label: t.tabSimulation, icon: FlaskConical, visible: allowed("assignment.simulate") },
    { key: "queue" as const, label: t.tabQueue, icon: Inbox, visible: allowed("assignment.queue.manage") },
    { key: "audit" as const, label: t.tabAudit, icon: History, visible: allowed("assignment.audit.view") },
  ]), [t, allowed]);
  const visibleTabs = tabs.filter((x) => x.visible);

  const changeTab = (k: CoordinationTab) => { setTab(k); router.replace(`/${locale}/portal/control-center/coordination/${orgId}?tab=${k}`, { scroll: false }); };

  const crumbs = [
    { label: cc.breadcrumbHome, href: `/${locale}/portal/control-center` },
    { label: t.navCoordination, href: `/${locale}/portal/control-center/coordination` },
    { label: orgName ?? orgId },
  ];
  const actions = <button type="button" className="cc-secondary" disabled={loading} onClick={() => void refresh()}><RefreshCw size={16} aria-hidden />{t.retry}</button>;

  if (authLoading || loading) return <ControlCenterShell locale={locale} active="coordination" crumbs={crumbs} title={t.loading}><p role="status">{t.loading}</p></ControlCenterShell>;
  if (!user) return <ControlCenterShell locale={locale} active="coordination" crumbs={crumbs} title={t.navCoordination}><button onClick={() => void signIn()}>{t.signin}</button></ControlCenterShell>;
  if (!orgName) return <ControlCenterShell locale={locale} active="coordination" crumbs={crumbs} title={t.navCoordination}><p className="cc-empty">{t.denied}</p></ControlCenterShell>;

  const activeTab = visibleTabs.some((x) => x.key === tab) ? tab : (visibleTabs[0]?.key ?? "overview");

  return (
    <ControlCenterShell locale={locale} active="coordination" crumbs={crumbs} title={orgName} intro={t.overviewIntro} actions={actions}>
      {error && <p role="alert" className="cc-message">{error}</p>}
      <div className="cc-tabs" role="tablist">
        {visibleTabs.map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" role="tab" aria-selected={activeTab === key} aria-current={activeTab === key ? "page" : undefined} onClick={() => changeTab(key)}>
            <Icon size={15} aria-hidden /> {label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <section>
          <ul className="cc-cards">
            <li className="cc-card">
              <h3>{t.activeTeams}</h3>
              <p className="cc-meta">{teams.filter((x) => x.configuration.active).length} / {teams.length}</p>
              {allowed("assignment.team.view") && <button type="button" className="cc-secondary" onClick={() => changeTab("teams")}>{t.viewTeams}</button>}
            </li>
            <li className="cc-card">
              <h3>{t.unassignedWork}</h3>
              <p className="cc-meta">{queue.length}</p>
              {allowed("assignment.queue.manage") && <button type="button" className="cc-secondary" onClick={() => changeTab("queue")}>{t.viewQueue}</button>}
            </li>
          </ul>
          <p className="cc-meta">{t.recentDecisions}: {locale === "ar" ? "استخدم سجل التعيينات وابحث عن حالة محددة — لا يوجد تجميع عبر المؤسسة على مستوى الخادم بعد." : "Use Assignment History and look up a specific case — there is no organization-wide decision feed on the backend yet."}</p>
        </section>
      )}
      {activeTab === "teams" && <CoordinatorTeams locale={locale} api={api} allowed={allowed} teams={teams} onChanged={refresh} />}
      {activeTab === "preferences" && <RoutingPreferences locale={locale} orgId={orgId} api={api} allowed={allowed} teams={teams} />}
      {activeTab === "policy" && <RoutingPolicy locale={locale} api={api} allowed={allowed} teams={teams} />}
      {activeTab === "simulation" && <RoutingSimulation locale={locale} api={api} allowed={allowed} />}
      {activeTab === "queue" && <AssignmentQueue locale={locale} api={api} allowed={allowed} queue={queue} teams={teams} onChanged={refresh} subject={user.profile.sub} />}
      {activeTab === "audit" && <AssignmentAudit locale={locale} api={api} allowed={allowed} teams={teams} />}
    </ControlCenterShell>
  );
}
