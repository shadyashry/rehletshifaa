"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { useControlCenterAccess } from "./control-center-access";
import { useAdminApi } from "./admin-api";
import { NAV_GROUPS, ccHref, pick } from "./control-center-nav";
import { EmptyState } from "./cc-ui";

type Attention = { key: string; count: number; label: string; href: string };
type Org = { id: string; status: string };

/**
 * Control Center home. Answers "What needs my attention?" from real backend reads only — each count is a list the
 * caller is already allowed to read, counted in the browser; nothing is estimated. Then "What do you want to manage?".
 */
export function ControlCenterOverview({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const api = useAdminApi();
  const [items, setItems] = useState<Attention[] | null>(null);

  useEffect(() => {
    if (access.loading || !user) return;
    let live = true;
    const jobs: Promise<Attention | null>[] = [];
    const count = (key: string, label: string, href: string, work: () => Promise<number>) =>
      jobs.push(work().then((n) => ({ key, count: n, label, href })).catch(() => null));
    const orgs = access.can("provider.view") ? api<Org[]>("/admin/providers").catch(() => [] as Org[]) : Promise.resolve([] as Org[]);
    if (access.can("credential.review")) count("credentials", ar ? "اعتمادات بانتظار المراجعة" : "Credentials waiting for review", ccHref(locale, "/credentials"),
      async () => (await Promise.all((await orgs).map((o) => api<unknown[]>(`/admin/providers/${o.id}/credential-reviews`).catch(() => [])))).reduce((n, r) => n + r.length, 0));
    if (access.can("provider.view")) {
      count("orgs", ar ? "مؤسسات قيد الإعداد" : "Organizations still being set up", ccHref(locale, "/providers"),
        async () => (await orgs).filter((o) => ["DRAFT", "ONBOARDING", "READINESS_REVIEW"].includes(o.status)).length);
      count("pending", ar ? "أشخاص بانتظار تفعيل العضوية" : "People waiting for membership activation", ccHref(locale, "/providers/consultants"),
        async () => (await Promise.all((await orgs).slice(0, 25).map((o) => api<{ members: { status: string }[] }>(`/admin/providers/${o.id}`).then((d) => d.members.filter((m) => m.status === "PENDING").length).catch(() => 0)))).reduce((a, b) => a + b, 0));
    }
    if (access.can("assignment.queue.manage")) count("queue", ar ? "حالات بانتظار منسق" : "Cases waiting for a coordinator", ccHref(locale, "/coordination"),
      async () => { const list = await api<{ id: string }[]>("/admin/coordination/organizations"); return (await Promise.all(list.map((o) => api<unknown[]>(`/admin/coordination/${o.id}/queue`).catch(() => [])))).reduce((n, r) => n + r.length, 0); });
    if (access.legacy.admin) {
      count("direct", ar ? "استشاريون مباشرون بانتظار الاعتماد" : "Direct consultants awaiting approval", ccHref(locale, "/credentials?view=direct"),
        async () => (await api<{ credentialingStatus?: string }[]>("/admin/practitioners")).filter((p) => p.credentialingStatus === "UNDER_REVIEW").length);
      count("staff", ar ? "دعوات موظفين لم تُقبل بعد" : "Staff invitations not yet accepted", ccHref(locale, "/team"),
        async () => (await api<{ accountStatus: string }[]>("/admin/staff-teams")).filter((m) => m.accountStatus === "INVITED").length);
    }
    if (access.legacy.identityReviewer) count("identity", ar ? "طلبات تحقق من الهوية" : "Identity checks waiting", ccHref(locale, "/identity-checks"),
      async () => (await api<unknown[]>("/identity-review/queue")).length);
    void Promise.all(jobs).then((r) => { if (live) setItems(r.filter((x): x is Attention => !!x)); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.loading, access.decisions, user?.profile?.sub, locale]);

  const destinations = NAV_GROUPS.flatMap((g) => g.items).filter((i) => i.key !== "overview" && i.visible(access));
  const canAddConsultant = access.can("provider.clinician.invite") || access.legacy.canManage;
  const actions = canAddConsultant ? <Link className="cc-primary" href={ccHref(locale, "/providers/onboarding/new")}><Plus size={16} aria-hidden />{ar ? "إضافة استشاري" : "Add consultant"}</Link> : undefined;
  const title = ar ? "مركز التحكم" : "Control Center";
  const crumbs = [{ label: title }];

  if (authLoading) return <ControlCenterShell locale={locale} active="overview" crumbs={crumbs} title={title}><p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p></ControlCenterShell>;
  if (!user) return <ControlCenterShell locale={locale} active="overview" crumbs={crumbs} title={title}><button onClick={() => void signIn()}>{ar ? "تسجيل الدخول الآمن" : "Sign in securely"}</button></ControlCenterShell>;

  const attention = (items ?? []).filter((i) => i.count > 0);
  return (
    <ControlCenterShell locale={locale} active="overview" crumbs={crumbs} title={title}
      intro={ar ? "ما يحتاج إلى متابعتك، وكل ما تديره في مكان واحد." : "What needs your attention, and everything you manage, in one place."} actions={actions}>
      <section className="cc-section" aria-labelledby="attention-title">
        <div className="cc-section-head"><div><h2 id="attention-title">{ar ? "ما يحتاج إلى متابعتك" : "Needs your attention"}</h2></div></div>
        {access.loading || items === null ? <p role="status">{ar ? "جارٍ التحقق من العمل المعلّق…" : "Checking for waiting work…"}</p>
          : !attention.length ? <EmptyState title={ar ? "لا يوجد ما ينتظرك الآن" : "Nothing is waiting for you"} body={ar ? "ستظهر هنا المراجعات والدعوات والحالات التي تحتاج إلى إجراء." : "Reviews, invitations and cases that need action will appear here."} />
          : <ul className="cc-attention">{attention.map((i) => <li key={i.key}><Link href={i.href}><strong>{i.count.toLocaleString(locale)}</strong><span>{i.label}</span></Link></li>)}</ul>}
      </section>
      <section className="cc-section" aria-labelledby="manage-title">
        <div className="cc-section-head"><div><h2 id="manage-title">{ar ? "ما الذي تريد إدارته؟" : "What do you want to manage?"}</h2></div></div>
        {access.loading ? <p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p> : !destinations.length
          ? <EmptyState title={ar ? "لا توجد أقسام متاحة لحسابك" : "No areas are available to your account"} body={ar ? "اطلب من مسؤول الوصول منحك الدور المناسب." : "Ask your access administrator for the role you need."} />
          : <ul className="cc-destinations">{destinations.map((d) => { const Icon = d.icon; return <li key={d.key}><Link href={ccHref(locale, d.path)}><Icon size={20} aria-hidden /><span><strong>{pick(d.label, locale)}</strong><span>{pick(d.summary, locale)}</span></span></Link></li>; })}</ul>}
      </section>
    </ControlCenterShell>
  );
}
