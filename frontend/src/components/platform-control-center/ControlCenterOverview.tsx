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
import { addConsultantHref } from "./consultant-model";

/** Where the waiting work is and how much of it; `partial` says the count covers only part of the data. */
type Found = { count: number; href: string; partial?: boolean };
/** One kind of waiting work, read from an endpoint the caller is already allowed to read. */
type Source = { key: string; group: string; label: [string, string]; applies: (a: ControlCenterAccess) => boolean; find: (ctx: Ctx) => Promise<Found> };
type Ctx = { api: AdminApi; locale: Locale };
type Result = { source: Source; found?: Found; failed?: boolean };

/**
 * Every source of "needs attention" the Home page knows, in navigation order. Each is shown only to people who hold the
 * permission to read it and act on it; nothing is estimated.
 */
const SOURCES: Source[] = [
  { key: "consultants", group: "consultants", label: ["Consultants waiting for case approval", "استشاريون بانتظار اعتماد الحالات"], applies: (a) => a.can("CREDENTIAL_DECIDE"),
    find: async ({ api, locale }) => ({ count: (await api<{ credentialingStatus?: string }[]>("/admin/practitioners")).filter((p) => p.credentialingStatus === "UNDER_REVIEW").length, href: ccHref(locale, "/consultants") }) },
  { key: "identity", group: "reviews", label: ["Identity checks waiting for a decision", "طلبات تحقق من الهوية بانتظار قرار"], applies: (a) => a.can("PATIENT_IDENTITY_REVIEW"),
    find: async ({ api, locale }) => ({ count: (await api<unknown[]>("/identity-review/queue")).length, href: ccHref(locale, "/identity-checks") }) },
  { key: "queue", group: "operations", label: ["Cases waiting for a coordinator", "حالات بانتظار منسق"], applies: (a) => a.can("ROUTING_ASSIGN"),
    find: async ({ api, locale }) => ({ count: (await api<unknown[]>("/admin/coordination/queue")).length, href: ccHref(locale, "/coordination?tab=advanced") }) },
  { key: "invitations", group: "workforce", label: ["Staff invitations not yet accepted", "دعوات موظفين لم تُقبل بعد"], applies: (a) => a.can("WORKFORCE_READ"),
    find: async ({ api, locale }) => ({ count: (await api<{ invitations: { status: string }[] }>("/admin/platform-access/staff")).invitations.filter((i) => i.status === "QUEUED" || i.status === "SENT").length, href: ccHref(locale, "/people") }) },
  { key: "staffing", group: "workforce", label: ["Staffing requests waiting for a decision", "طلبات توظيف بانتظار قرار"], applies: (a) => a.can("WORKFORCE_ADMINISTER"),
    find: async ({ api, locale }) => ({ count: (await api<{ status: string }[]>("/admin/platform-access/staffing-requests")).filter((r) => r.status === "SUBMITTED").length, href: ccHref(locale, "/staffing-requests") }) },
  { key: "administrators", group: "access", label: ["Administrator changes waiting for a second approver", "تغييرات مسؤولي النظام بانتظار موافقة ثانية"], applies: (a) => a.can("ACCESS_GOVERN") || !!a.me?.platformAccountOwner,
    find: async ({ api, locale }) => ({ count: (await api<{ requests: { status: string }[] }>("/admin/platform-access/administrator-changes")).requests.filter((r) => r.status === "PENDING").length, href: ccHref(locale, "/administrators") }) },
  { key: "ownership", group: "access", label: ["Platform ownership transfers waiting for you", "تسليمات ملكية المنصة بانتظارك"],
    applies: (a) => a.can("ACCESS_GOVERN") || !!a.me?.platformAccountOwner || !!a.me?.pendingActions.includes("ACCEPT_PLATFORM_OWNERSHIP"),
    find: async ({ api, locale }) => ({ count: (await api<{ transfers: { canAccept: boolean; canVerify: boolean }[] }>("/admin/platform-access/owner-transfers")).transfers.filter((x) => x.canAccept || x.canVerify).length, href: ccHref(locale, "/ownership") }) },
  { key: "mfa", group: "access", label: ["MFA reset requests waiting for approval", "طلبات إعادة تعيين التحقق بانتظار الموافقة"], applies: (a) => a.can("WORKFORCE_ADMINISTER"),
    find: async ({ api, locale }) => ({ count: (await api<{ status: string }[]>("/admin/platform-access/mfa-reset-requests")).filter((r) => r.status === "PENDING").length, href: ccHref(locale, "/recertification") }) },
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
  const [attempt, setAttempt] = useState(0);
  const sources = access.loading ? [] : SOURCES.filter((s) => s.applies(access));
  const sourceKeys = sources.map((s) => s.key).join();
  // Results are kept with the sources, person, language and attempt they were read for: anything else is still loading.
  const resultsKey = `${sourceKeys}|${user?.profile?.sub ?? ""}|${locale}|${attempt}`;
  const [read, setRead] = useState<{ key: string; results: Result[] } | null>(null);
  const results = read?.key === resultsKey ? read.results : null;

  useEffect(() => {
    if (access.loading || !user) return;
    let live = true;
    const ctx: Ctx = { api, locale };
    void Promise.all(sources.map((source) => source.find(ctx).then((found): Result => ({ source, found }), (): Result => ({ source, failed: true }))))
      .then((r) => { if (live) setRead({ key: resultsKey, results: r }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.loading, sourceKeys, user?.profile?.sub, locale, attempt]);

  const canAddConsultant = access.can("CONSULTANT_ONBOARD");
  const actions = canAddConsultant ? <Link className="cc-primary" href={addConsultantHref(locale)}><Plus size={16} aria-hidden />{ar ? "إضافة استشاري" : "Add consultant"}</Link> : undefined;
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
                  <span>{groupLabel(source.group)}</span></span>
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
