"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { accessCopy, permissionLabel } from "./access-copy";
import "./access-governance.css";
import { ControlCenterShell } from "./ControlCenterShell";
import { useControlCenterAccess } from "./control-center-access";
import { useAdminApi } from "./admin-api";
import { ccHref, type NavKey } from "./control-center-nav";
import { EmptyState, ErrorNotice, SuccessNotice } from "./cc-ui";
import type { Permission, Role } from "./access-model";
import { PeopleAccess } from "./access-people";
import { PermissionsView, RolesView } from "./access-roles";
import { AuditView } from "./access-audit";

export type AccessView = "users" | "roles" | "effective" | "permissions" | "audit";
const navFor: Record<AccessView, NavKey> = { users: "accessUsers", roles: "accessRoles", effective: "accessEffective", permissions: "accessPermissions", audit: "accessAudit" };

/**
 * Access & Governance inside the Control Center, on two axes: **People** (who is this person, where can they sign in,
 * what business access do they have, where and why) and **Roles** (what a role allows, where it applies, its governed
 * versions), plus **Audit**. The same accepted backend (`/admin/access/**`) and role lifecycle; authorization is never
 * reconstructed here — every answer and explanation is the backend's own decision.
 */
export function AccessGovernance({ locale, view: requested, initialTab, initialSubject }: { locale: Locale; view?: AccessView; initialTab?: AccessView; initialSubject?: string; initialOrganization?: string }) {
  const view: AccessView = requested ?? initialTab ?? "roles";
  const t = accessCopy[locale]; const ar = locale === "ar";
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const rawApi = useAdminApi();
  const api = useCallback(<T,>(path: string, method = "GET", body?: unknown) => rawApi<T>("/admin/access" + path, { method, body }), [rawApi]);
  const can = access.can;
  const [roles, setRoles] = useState<Role[]>([]); const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loaded, setLoaded] = useState(false); const [page, setPage] = useState(0);
  const [error, setError] = useState<unknown>(null); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<void>) => { setBusy(true); setError(null); setNotice(""); try { await work(); } catch (e) { setError(e); } finally { setBusy(false); } };
  const canView = can("access.role.view");
  const reload = useCallback(async () => {
    setError(null);
    try { const [r, p] = await Promise.all([api<Role[]>("/roles?offset=" + page * 100), api<Permission[]>("/permissions")]); setRoles(r); setPermissions(p); }
    catch (e) { setError(e); } finally { setLoaded(true); }
  }, [api, page]);
  // Reads happen once per signed-in subject; a silent token renewal must not discard an open form (Phase 5B).
  useEffect(() => { if (user && canView) void reload(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.profile?.sub, canView, page]);
  const label = useCallback((key: string) => { const p = permissions.find((x) => x.key === key); return p ? permissionLabel(p, locale) : t.technical; }, [permissions, locale, t.technical]);

  const titles: Record<AccessView, [string, string, string, string]> = {
    users: ["People", "الأشخاص", "Find a person: where they can sign in, what business access they have, where it applies and why — and change it safely.", "ابحث عن شخص: أين يمكنه تسجيل الدخول، وما صلاحياته في العمل، وأين تنطبق ولماذا — وغيّرها بأمان."],
    effective: ["People", "الأشخاص", "Find a person: where they can sign in, what business access they have, where it applies and why — and change it safely.", "ابحث عن شخص: أين يمكنه تسجيل الدخول، وما صلاحياته في العمل، وأين تنطبق ولماذا — وغيّرها بأمان."],
    roles: ["Roles", "الأدوار", "What each business role allows and where it applies. Changes are prepared, checked and published by an independent reviewer.", "ما يسمح به كل دور وأين يُطبَّق. تُعد التغييرات وتُفحص ثم ينشرها مراجع مستقل."],
    permissions: ["Permission reference", "مرجع الصلاحيات", "Everything a role can grant, grouped by area. Defined by engineering.", "كل ما يمكن أن يمنحه الدور، مجمّعًا حسب المجال. يحددها فريق الهندسة."],
    audit: ["Audit", "سجل التدقيق", "Every access change and decision, newest first.", "كل تغيير وقرار في الصلاحيات، الأحدث أولًا."],
  };
  const [en, arTitle, enIntro, arIntro] = titles[view];
  const secondary = view === "roles" ? <Link className="cc-secondary" href={ccHref(locale, "/access/permissions")}>{ar ? "مرجع الصلاحيات" : "Permission reference"}</Link>
    : view === "permissions" ? <Link className="cc-secondary" href={ccHref(locale, "/access/roles")}>{ar ? "الأدوار" : "Roles"}</Link> : null;
  const shell = (body: ReactNode, actions?: ReactNode) => <ControlCenterShell locale={locale} active={view === "effective" ? "accessUsers" : navFor[view]} title={ar ? arTitle : en} intro={ar ? arIntro : enIntro} actions={actions || secondary ? <>{actions}{secondary}</> : undefined}><div className="ag ag-embedded" dir={ar ? "rtl" : "ltr"}>{body}</div></ControlCenterShell>;
  if (authLoading || access.loading) return shell(<p role="status">{t.loading}</p>);
  if (!user) return shell(<button onClick={() => void signIn()}>{t.signin}</button>);
  if (!canView) return shell(<EmptyState title={t.denied} />);
  if (!loaded && !error) return shell(<p role="status">{t.loading}</p>);
  const recentAuth = access.decisions.some((d) => d.permission.startsWith("access.") && access.needsFreshSignIn(d.permission));
  const common = <>
    <ErrorNotice error={error} locale={locale} action={loaded && roles.length ? "save" : "load"} onRetry={() => void reload()} />
    <SuccessNotice>{notice || null}</SuccessNotice>
    {recentAuth && <p className="cc-notice cc-notice-info">{t.recent} <button type="button" className="cc-secondary cc-small" onClick={() => void signIn(true)}>{t.signin}</button></p>}
  </>;
  if (view === "roles") return <RolesView locale={locale} api={api} can={can} roles={roles} permissions={permissions} label={label} run={run} busy={busy} setNotice={setNotice} reloadRoles={reload} userSubject={user.profile.sub} page={page} setPage={setPage} render={(body, actions) => shell(<>{common}{body}</>, actions)} />;
  if (view === "permissions") return shell(<>{common}<PermissionsView locale={locale} permissions={permissions} label={label} /></>);
  if (view === "audit") return shell(<>{common}{can("access.audit.view") ? <AuditView locale={locale} api={api} canViewProviders={can("provider.view")} /> : <EmptyState title={t.denied} />}</>);
  if (!can("access.effective_access.view")) return shell(<>{common}<EmptyState title={t.denied} /></>);
  return shell(<>{common}<PeopleAccess locale={locale} api={api} can={can} roles={roles} permissions={permissions} label={label} initialSubject={initialSubject} focusSummary={view === "effective" && !!initialSubject} /></>);
}
