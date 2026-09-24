"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { useAdminApi } from "./admin-api";
import { useControlCenterAccess } from "./control-center-access";
import { ErrorNotice, SectionTabs, StatusBadge, TabPanel } from "./cc-ui";
import { coordCopy } from "./coordination-copy";
import type { CoordinationOverview, CoordinationPerson, Team } from "./coordination-types";
import { CoordinationTeamsPeople } from "./CoordinationTeamsPeople";
import { ClinicianPreferences } from "./ClinicianPreferences";
import { RoutingRules } from "./RoutingRules";
import { CoordinationAdvanced } from "./CoordinationAdvanced";

export type CoordinationSection = "teams" | "preferences" | "rules" | "advanced";

/** What every section receives: scoped reads, the caller's capabilities, and names for people and teams. */
export type CoordinationContext = {
  locale: Locale; orgId: string; base: string; api: ReturnType<typeof useAdminApi>; can: (permission: string) => boolean;
  teams: Team[]; people: CoordinationPerson[]; personName: (subject: string | null | undefined) => string; teamName: (id: string | null | undefined) => string;
  reload: () => Promise<void>;
};

/**
 * Coordination Setup for one organization (UX-7). Configuration and governance only: Teams & People, Clinician
 * Preferences, Rules and an Advanced area for diagnostics. It is deliberately not a case queue — coordinators take and
 * transfer cases in the Staff Portal. The mode banner always says whether routing is applied or evaluation-only.
 */
export function CareCoordinationWorkspace({ locale, orgId, initialSection }: { locale: Locale; orgId: string; initialSection?: CoordinationSection }) {
  const t = coordCopy[locale];
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const api = useAdminApi();
  const router = useRouter();
  const base = `/admin/coordination/${orgId}`;

  const [orgName, setOrgName] = useState<string | null>(null);
  const [found, setFound] = useState<boolean | null>(null);
  const [overview, setOverview] = useState<CoordinationOverview | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [people, setPeople] = useState<CoordinationPerson[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [section, setSection] = useState<CoordinationSection>(initialSection ?? "teams");
  const can = access.can;
  const canTeams = can("assignment.team.view");

  const loadTeams = useCallback(async () => {
    if (!canTeams) return;
    const [nextTeams, nextPeople] = await Promise.all([api<Team[]>(`${base}/teams`), api<CoordinationPerson[]>(`${base}/people`)]);
    setTeams(nextTeams); setPeople(nextPeople);
  }, [api, base, canTeams]);

  // One page read per attempt: the organization (for its name and the caller's reach), the mode banner, teams and people.
  const [attempt, setAttempt] = useState(0);
  const load = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    if (!user || access.loading) return;
    let live = true;
    api<{ id: string; displayName: string }[]>("/admin/coordination/organizations").then(async (organizations) => {
      const mine = organizations.find((o) => o.id === orgId);
      if (!live) return;
      setError(null); setOrgName(mine?.displayName ?? null); setFound(!!mine);
      if (!mine) return;
      const [nextOverview, roster] = await Promise.all([api<CoordinationOverview>(`${base}/overview`),
        canTeams ? Promise.all([api<Team[]>(`${base}/teams`), api<CoordinationPerson[]>(`${base}/people`)]) : Promise.resolve(null)]);
      if (!live) return;
      setOverview(nextOverview);
      if (roster) { setTeams(roster[0]); setPeople(roster[1]); }
    }).catch((e) => { if (live) setError(e); });
    return () => { live = false; };
  }, [user, access.loading, api, orgId, base, canTeams, attempt]);

  const sections = useMemo(() => ([
    { key: "teams" as const, label: t.sections.teams, visible: can("assignment.team.view") },
    { key: "preferences" as const, label: t.sections.preferences, visible: can("assignment.policy.view") },
    { key: "rules" as const, label: t.sections.rules, visible: can("assignment.policy.view") },
    { key: "advanced" as const, label: t.sections.advanced, visible: ["assignment.simulate", "assignment.audit.view", "assignment.queue.manage", "assignment.policy.view"].some(can) },
  ]).filter((s) => s.visible), [t, can]);
  const active = sections.some((s) => s.key === section) ? section : sections[0]?.key;
  const choose = (next: CoordinationSection) => { setSection(next); router.replace(`/${locale}/portal/control-center/coordination/${orgId}?tab=${next}`, { scroll: false }); };

  const names = useMemo(() => new Map(people.map((p) => [p.subject, p.name])), [people]);
  const personName = useCallback((subject: string | null | undefined) => (subject ? names.get(subject) ?? t.unnamed : t.none), [names, t]);
  const teamName = useCallback((id: string | null | undefined) => (id ? teams.find((x) => x.id === id)?.name ?? t.unnamed : t.notSet), [teams, t]);
  const context: CoordinationContext = { locale, orgId, base, api, can, teams, people, personName, teamName, reload: loadTeams };

  const crumbs = [{ label: orgName ?? t.organization }];
  const shell = (children: React.ReactNode) => <ControlCenterShell locale={locale} active="coordination" crumbs={crumbs} title={t.navCoordination} intro={orgName ? `${orgName} — ${t.intro}` : t.intro}>{children}</ControlCenterShell>;

  if (authLoading || access.loading || (user && found === null && !error)) return shell(<p role="status">{t.loading}</p>);
  if (!user) return shell(<button type="button" onClick={() => void signIn()}>{t.signin}</button>);
  if (error && found === null) return shell(<ErrorNotice error={error} locale={locale} action="load" onRetry={() => void load()} />);
  if (!found || !active) return shell(<p className="cc-empty">{t.denied}</p>);

  return shell(<>
    <ErrorNotice error={error} locale={locale} action="load" onRetry={() => void load()} />
    {overview && <ModeBanner locale={locale} overview={overview} />}
    <SectionTabs label={t.sectionsLabel} tabs={sections} active={active} onChange={choose} />
    <TabPanel id={active}>
      {active === "teams" && <CoordinationTeamsPeople {...context} />}
      {active === "preferences" && <ClinicianPreferences {...context} />}
      {active === "rules" && <RoutingRules {...context} />}
      {active === "advanced" && <CoordinationAdvanced {...context} overview={overview} />}
    </TabPanel>
  </>);
}

/** What is real vs evaluation-only, stated at the top of every section. */
function ModeBanner({ locale, overview }: { locale: Locale; overview: CoordinationOverview }) {
  const t = coordCopy[locale].mode;
  if (overview.policyVersion === null) return <div className="cc-notice cc-notice-info" role="note"><div><p><StatusBadge tone="warning">{t.noPolicy}</StatusBadge></p><p className="cc-meta">{t.noPolicyBody}</p></div></div>;
  if (overview.liveCases > 0) return <div className="cc-notice cc-notice-info" role="note"><div><p><StatusBadge tone="info">{t.live(overview.liveCases)}</StatusBadge></p><p className="cc-meta">{t.liveBody}</p></div></div>;
  return <div className="cc-notice cc-notice-info" role="note"><div><p><StatusBadge tone="neutral">{t.evaluation}</StatusBadge></p><p className="cc-meta">{t.evaluationBody}</p></div></div>;
}
