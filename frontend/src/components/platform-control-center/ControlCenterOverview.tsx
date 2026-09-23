"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { useControlCenterAccess, type ControlCenterAccess } from "./control-center-access";
import { useAdminApi, type AdminApi } from "./admin-api";
import { NAV_GROUPS, ccHref, openableSections, pick } from "./control-center-nav";
import { EmptyState } from "./cc-ui";
import { addClinicianHref } from "./clinician-model";

type Org = { id: string; status: string };
/** Where the waiting work is and how much of it; `partial` says the count covers only part of the data. */
type Found = { count: number; href: string; partial?: boolean };
/** One kind of waiting work, read from an endpoint the caller is already allowed to read. */
type Source = { key: string; group: string; label: [string, string]; applies: (a: ControlCenterAccess) => boolean; find: (ctx: Ctx) => Promise<Found> };
type Ctx = { api: AdminApi; locale: Locale; orgs: () => Promise<Org[]> };
type Result = { source: Source; found?: Found; failed?: boolean };

/** Membership reads fan out per organization; the Home page checks at most this many. */
const MEMBER_SCAN_LIMIT = 25;
const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
/** Link straight to the one place the work is when there is exactly one, else to the list that holds it. */
const one = (hits: string[], single: (id: string) => string, list: string) => (hits.length === 1 ? single(hits[0]) : list);

/**
 * Every source of "needs attention" the Home page knows, in navigation order. Each is shown only to people whose
 * capabilities (or the backend's own legacy role gate) already let them read it and act on it; nothing is estimated.
 */
const SOURCES: Source[] = [
  { key: "credentials", group: "reviews", label: ["Credentials waiting for review", "اعتمادات بانتظار المراجعة"], applies: (a) => a.can("credential.review"),
    find: async ({ api, locale, orgs }) => {
      const rows = await Promise.all((await orgs()).map(async (o) => [o.id, (await api<unknown[]>(`/admin/providers/${o.id}/credential-reviews`)).length] as const));
      return { count: sum(rows.map(([, n]) => n)), href: one(rows.filter(([, n]) => n).map(([id]) => id), (id) => ccHref(locale, `/credentials?org=${id}`), ccHref(locale, "/credentials")) };
    } },
  { key: "direct", group: "reviews", label: ["Direct clinicians waiting for case approval", "أطباء مباشرون بانتظار اعتماد الحالات"], applies: (a) => a.legacy.admin,
    find: async ({ api, locale }) => ({ count: (await api<{ credentialingStatus?: string; providerCredentialing?: boolean }[]>("/admin/practitioners")).filter((p) => p.credentialingStatus === "UNDER_REVIEW" && !p.providerCredentialing).length, href: ccHref(locale, "/credentials?view=direct") }) },
  { key: "identity", group: "reviews", label: ["Identity checks waiting for a decision", "طلبات تحقق من الهوية بانتظار قرار"], applies: (a) => a.legacy.identityReviewer,
    find: async ({ api, locale }) => ({ count: (await api<unknown[]>("/identity-review/queue")).length, href: ccHref(locale, "/identity-checks") }) },
  { key: "orgs", group: "providers", label: ["Organizations still being set up", "جهات طبية ما زالت قيد الإعداد"], applies: (a) => a.can("provider.view"),
    find: async ({ locale, orgs }) => {
      const open = (await orgs()).filter((o) => ["DRAFT", "ONBOARDING", "READINESS_REVIEW"].includes(o.status)).map((o) => o.id);
      return { count: open.length, href: one(open, (id) => ccHref(locale, `/providers/${id}?tab=setup`), ccHref(locale, "/providers")) };
    } },
  { key: "members", group: "providers", label: ["People waiting for membership activation", "أشخاص بانتظار تفعيل العضوية"], applies: (a) => a.can("provider.view"),
    find: async ({ api, locale, orgs }) => {
      const all = await orgs();
      const rows = await Promise.all(all.slice(0, MEMBER_SCAN_LIMIT).map(async (o) => [o.id, (await api<{ members: { status: string }[] }>(`/admin/providers/${o.id}`)).members.filter((m) => m.status === "PENDING").length] as const));
      return { count: sum(rows.map(([, n]) => n)), partial: all.length > MEMBER_SCAN_LIMIT, href: one(rows.filter(([, n]) => n).map(([id]) => id), (id) => ccHref(locale, `/providers/${id}?tab=people`), ccHref(locale, "/providers")) };
    } },
  { key: "staff", group: "operations", label: ["Staff invitations not yet accepted", "دعوات موظفين لم تُقبل بعد"], applies: (a) => a.legacy.admin,
    find: async ({ api, locale }) => ({ count: (await api<{ accountStatus: string }[]>("/admin/staff-teams")).filter((m) => m.accountStatus === "INVITED").length, href: ccHref(locale, "/team") }) },
  { key: "queue", group: "operations", label: ["Cases waiting for a coordinator", "حالات بانتظار منسق"], applies: (a) => a.can("assignment.queue.manage"),
    find: async ({ api, locale }) => {
      const rows = await Promise.all((await api<{ id: string }[]>("/admin/coordination/organizations")).map(async (o) => [o.id, (await api<unknown[]>(`/admin/coordination/${o.id}/queue`)).length] as const));
      return { count: sum(rows.map(([, n]) => n)), href: one(rows.filter(([, n]) => n).map(([id]) => id), (id) => ccHref(locale, `/coordination/${id}?tab=queue`), ccHref(locale, "/coordination")) };
    } },
];

/**
 * Control Center Home. Answers one question — "What needs my attention?" — from real backend reads only. Navigation
 * is the sidebar's job, so there is no destination grid here. A count that could not be read is reported as such,
 * never as zero and never as "no access".
 */
export function ControlCenterOverview({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const api = useAdminApi();
  const [results, setResults] = useState<Result[] | null>(null);
  const [attempt, setAttempt] = useState(0);
  const sources = access.loading ? [] : SOURCES.filter((s) => s.applies(access));
  const sourceKeys = sources.map((s) => s.key).join();

  useEffect(() => {
    if (access.loading || !user) return;
    let live = true;
    setResults(null);
    let orgList: Promise<Org[]> | undefined;
    const ctx: Ctx = { api, locale, orgs: () => (orgList ??= api<Org[]>("/admin/providers")) };
    void Promise.all(sources.map((source) => source.find(ctx).then((found): Result => ({ source, found }), (): Result => ({ source, failed: true }))))
      .then((r) => { if (live) setResults(r); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.loading, sourceKeys, user?.profile?.sub, locale, attempt]);

  const canAddConsultant = access.can("provider.clinician.invite") || access.legacy.canManage;
  const actions = canAddConsultant ? <Link className="cc-primary" href={addClinicianHref(locale)}><Plus size={16} aria-hidden />{ar ? "إضافة طبيب" : "Add clinician"}</Link> : undefined;
  const title = ar ? "مركز التحكم" : "Control Center";
  const intro = ar ? "ما يحتاج إلى متابعتك في المجالات التي تديرها." : "What needs your attention in the areas you manage.";
  const shell = (body: React.ReactNode) => <ControlCenterShell locale={locale} active="overview" title={title} intro={intro} actions={actions}>{body}</ControlCenterShell>;
  const checking = <ul className="cc-attention-skeleton" role="status" aria-label={ar ? "جارٍ التحقق من العمل المعلّق…" : "Checking for waiting work…"}><li /><li /></ul>;

  if (authLoading) return shell(checking);
  if (!user) return shell(<button onClick={() => void signIn()}>{ar ? "تسجيل الدخول الآمن" : "Sign in securely"}</button>);
  if (access.loading) return shell(checking);
  if (access.failed) return shell(<div className="cc-notice cc-notice-error" role="alert">{ar ? "تعذّر التحقق من المجالات المتاحة لك. لم يتغيّر شيء." : "We couldn't check which areas you can use. Nothing has changed."} <button type="button" className="cc-link" onClick={access.retry}>{ar ? "إعادة المحاولة" : "Try again"}</button></div>);
  const sections = openableSections(access);
  if (!sections.length) return shell(<EmptyState title={ar ? "لا توجد مجالات في مركز التحكم لحسابك" : "No Control Center areas are set up for your account"} body={ar ? "إذا كنت تحتاج إلى أحدها، اطلب الدور المناسب من مسؤول الصلاحيات." : "If you need one, ask your access administrator for the right role."} />);
  if (!sources.length) return shell(
    <EmptyState title={ar ? "لا يوجد عمل منتظر نتابعه هنا لمجالاتك" : "There's no waiting work to track here for your areas"}
      body={ar ? "افتح مجالاتك من القائمة:" : "Open your areas from the menu:"}
      action={<ul className="cc-shortcuts">{sections.slice(0, 3).map((s) => <li key={s.key}><Link href={ccHref(locale, s.path)}>{pick(s.label, locale)}</Link></li>)}</ul>} />);
  if (!results) return shell(checking);

  const waiting = results.filter((r) => r.found && r.found.count > 0);
  const failed = results.filter((r) => r.failed);
  const Next = ar ? ChevronLeft : ChevronRight;
  const groupLabel = (key: string) => pick(NAV_GROUPS.find((g) => g.key === key)!.label, locale);
  const checked = results.filter((r) => r.found).map((r) => groupLabel(r.source.group)).filter((g, i, all) => all.indexOf(g) === i);
  return shell(
    <section aria-labelledby="attention-title" className="cc-section">
      <h2 id="attention-title" className="cc-sr">{ar ? "ما يحتاج إلى متابعتك" : "Needs your attention"}</h2>
      {failed.length > 0 && <div className="cc-notice cc-notice-error" role="alert">
        {ar ? "تعذّر التحقق من: " : "Some waiting work couldn't be checked: "}{failed.map((r) => pick(r.source.label, locale)).join(ar ? "، " : ", ")}.{" "}
        <button type="button" className="cc-link" onClick={() => setAttempt((n) => n + 1)}>{ar ? "إعادة المحاولة" : "Try again"}</button>
      </div>}
      {waiting.length ? (
        <ul className="cc-attention">
          {waiting.map(({ source, found }) => (
            <li key={source.key}>
              <Link href={found!.href}>
                <span className="cc-attention-count">{found!.count.toLocaleString(locale)}</span>
                <span className="cc-attention-text"><strong>{pick(source.label, locale)}</strong>
                  <span>{groupLabel(source.group)}{found!.partial ? (ar ? ` · في أول ${MEMBER_SCAN_LIMIT.toLocaleString(locale)} جهة فقط` : ` · first ${MEMBER_SCAN_LIMIT} organizations only`) : ""}</span></span>
                <Next size={18} aria-hidden className="cc-attention-go" />
              </Link>
            </li>
          ))}
        </ul>
      ) : !failed.length ? (
        <EmptyState title={ar ? "لا يوجد ما ينتظرك." : "You're all caught up."} body={(ar ? "لا شيء ينتظر في: " : "Nothing is waiting in ") + checked.join(ar ? "، " : ", ") + "."} />
      ) : checked.length ? <p className="cc-meta">{ar ? "لا شيء ينتظر في المجالات التي أمكن التحقق منها." : "Nothing is waiting in the areas that could be checked."}</p> : null}
    </section>
  );
}
