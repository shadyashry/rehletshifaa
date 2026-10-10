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
import { ManagedCoordinationCases } from "./ManagedCoordinationCases";
import { ConversationSetup } from "./ConversationSetup";

export type CoordinationSection = "cases" | "teams" | "conversations" | "preferences" | "rules" | "advanced";

/** What every section receives: scoped reads, the caller's capabilities, and names for people and teams. */
export type CoordinationContext = {
  locale: Locale; base: string; api: ReturnType<typeof useAdminApi>; can: (permission: string) => boolean;
  teams: Team[]; people: CoordinationPerson[]; personName: (subject: string | null | undefined) => string; teamName: (id: string | null | undefined) => string;
  reload: () => Promise<void>;
};

/**
 * Coordination Setup (platform-wide): Teams & People, Consultant Preferences, Rules and an Advanced area for diagnostics
 * and manual routing. Readable with ROUTING_READ; configuration needs ROUTING_CONFIGURE, manual routing ROUTING_ASSIGN.
 * Team membership is managed in Workforce › Teams. It is deliberately not a case queue.
 */
export function CareCoordinationWorkspace({ locale, initialSection }: { locale: Locale; initialSection?: CoordinationSection }) {
  const t = coordCopy[locale];
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const api = useAdminApi();
  const router = useRouter();
  const base = "/admin/coordination";

  const [loaded, setLoaded] = useState(false);
  const [overview, setOverview] = useState<CoordinationOverview | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [people, setPeople] = useState<CoordinationPerson[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [section, setSection] = useState<CoordinationSection>(initialSection ?? "teams");
  const can = access.can;
  const canRead = can("ROUTING_READ");
  const canSummarize = can("COORDINATION_CASE_SUMMARY");

  const loadTeams = useCallback(async () => {
    if (!canRead) return;
    const [nextTeams, nextPeople] = await Promise.all([api<Team[]>(`${base}/teams`), api<CoordinationPerson[]>(`${base}/people`)]);
    setTeams(nextTeams); setPeople(nextPeople);
  }, [api, base, canRead]);

  // One page read per attempt: the overview, teams and people.
  const [attempt, setAttempt] = useState(0);
  const load = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    if (!user || access.loading || !canRead) return;
    let live = true;
    Promise.all([api<CoordinationOverview>(`${base}/overview`), api<Team[]>(`${base}/teams`), api<CoordinationPerson[]>(`${base}/people`)])
      .then(([nextOverview, nextTeams, nextPeople]) => { if (!live) return; setError(null); setOverview(nextOverview); setTeams(nextTeams); setPeople(nextPeople); setLoaded(true); })
      .catch((e) => { if (live) setError(e); });
    return () => { live = false; };
  }, [user, access.loading, api, base, canRead, attempt]);

  const sections = useMemo(() => ([
    { key: "cases" as const, label: locale === "ar" ? "الحالات المُدارة" : "Managed cases", visible: canSummarize },
    { key: "teams" as const, label: t.sections.teams, visible: canRead },
    { key: "conversations" as const, label: locale === "ar" ? "محادثات واتساب" : "WhatsApp conversations", visible: canRead },
    { key: "preferences" as const, label: t.sections.preferences, visible: canRead },
    { key: "rules" as const, label: t.sections.rules, visible: canRead },
    { key: "advanced" as const, label: t.sections.advanced, visible: canRead },
  ]).filter((s) => s.visible), [t, canRead, canSummarize, locale]);
  const active = sections.some((s) => s.key === section) ? section : sections[0]?.key;
  const choose = (next: CoordinationSection) => { setSection(next); router.replace(`/${locale}/portal/control-center/coordination?tab=${next}`, { scroll: false }); };

  const names = useMemo(() => new Map(people.map((p) => [p.subject, p.name])), [people]);
  const personName = useCallback((subject: string | null | undefined) => (subject ? names.get(subject) ?? t.unnamed : t.none), [names, t]);
  const teamName = useCallback((id: string | null | undefined) => (id ? teams.find((x) => x.id === id)?.name ?? t.unnamed : t.notSet), [teams, t]);
  const context: CoordinationContext = { locale, base, api, can, teams, people, personName, teamName, reload: loadTeams };

  const shell = (children: React.ReactNode) => <ControlCenterShell locale={locale} active="coordination" title={t.navCoordination} intro={t.intro}>{children}</ControlCenterShell>;

  if (authLoading || access.loading || (user && canRead && !loaded && !error)) return shell(<p role="status">{t.loading}</p>);
  if (!user) return shell(<button type="button" onClick={() => void signIn()}>{t.signin}</button>);
  if (error && !loaded) return shell(<ErrorNotice error={error} locale={locale} action="load" onRetry={() => void load()} />);
  if ((!canRead && !canSummarize) || !active) return shell(<p className="cc-empty">{t.denied}</p>);

  return shell(<>
    <ErrorNotice error={error} locale={locale} action="load" onRetry={() => void load()} />
    {overview && <ModeBanner locale={locale} overview={overview} />}
    <SectionTabs label={t.sectionsLabel} tabs={sections} active={active} onChange={choose} />
    <TabPanel id={active}>
      {active === "cases" && <ManagedCoordinationCases locale={locale} api={api} />}
      {active === "teams" && <CoordinationTeamsPeople {...context} />}
      {active === "conversations" && <ConversationSetup {...context} />}
      {active === "preferences" && <ClinicianPreferences {...context} />}
      {active === "rules" && <RoutingRules {...context} />}
      {active === "advanced" && <CoordinationAdvanced {...context} overview={overview} />}
    </TabPanel>
  </>);
}

/** Whether routing is in effect (an effective policy) and how many cases it has routed. */
function ModeBanner({ locale, overview }: { locale: Locale; overview: CoordinationOverview }) {
  const t = coordCopy[locale].mode;
  if (overview.policyVersion === null) return <div className="cc-notice cc-notice-info" role="note"><div><p><StatusBadge tone="warning">{t.noPolicy}</StatusBadge></p><p className="cc-meta">{t.noPolicyBody}</p></div></div>;
  return <div className="cc-notice cc-notice-info" role="note"><div><p><StatusBadge tone="info">{t.live(overview.routedCases)}</StatusBadge></p><p className="cc-meta">{t.liveBody}</p></div></div>;
}
