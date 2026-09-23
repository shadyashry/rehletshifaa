"use client";

import { useCallback, useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { IdentityReviewQueue } from "@/components/portal/PortalDirectories";
import { ControlCenterShell } from "./ControlCenterShell";
import { useControlCenterAccess } from "./control-center-access";
import { useAdminApi } from "./admin-api";
import { EmptyState, SuccessNotice } from "./cc-ui";
import { StaffInviteForm, StaffTeams } from "./legacy-admin";

const signInButton = (locale: Locale, signIn: () => void) => <button onClick={signIn}>{locale === "ar" ? "تسجيل الدخول الآمن" : "Sign in securely"}</button>;

/** Coordination, Operations and Finance staff: invitations, team leads and account access. */
export function StaffAndTeams({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const api = useAdminApi();
  const [inviting, setInviting] = useState(false); const [version, setVersion] = useState(0); const [notice, setNotice] = useState("");
  const title = ar ? "فريق رحلة شفاء" : "RehletShifaa Staff";
  const actions = access.legacy.canManage && !inviting ? <button type="button" onClick={() => { setInviting(true); setNotice(""); }}><UserPlus size={16} aria-hidden />{ar ? "دعوة موظف" : "Invite staff member"}</button> : undefined;
  const shell = (body: React.ReactNode) => <ControlCenterShell locale={locale} active="staff" title={title} intro={ar ? "موظفو التنسيق والعمليات والمالية، وقادة فرقهم، ووصول حساباتهم." : "Coordination, operations and finance staff, their team leads and their account access."} actions={actions}>{body}</ControlCenterShell>;
  if (authLoading || access.loading) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (!user) return shell(signInButton(locale, () => void signIn()));
  if (!access.legacy.admin) return shell(<EmptyState title={ar ? "ليس لديك وصول إلى هذه المساحة" : "You don't have access to this area"} />);
  return shell(
    <>
      <SuccessNotice>{notice || null}</SuccessNotice>
      {inviting && <StaffInviteForm locale={locale} api={api} onCancel={() => setInviting(false)} onInvited={() => { setInviting(false); setVersion((v) => v + 1); setNotice(ar ? "أُرسلت الدعوة. سيختار الموظف كلمة المرور من الرابط الآمن." : "Invitation sent. They will choose their password from the secure link."); }} />}
      <StaffTeams locale={locale} api={api} editable={access.legacy.systemAdmin} version={version} />
    </>
  );
}

/** Patient and representative identity verification requests. */
export function IdentityChecks({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const api = useAdminApi();
  const legacyApi = useCallback(<T,>(path: string, init?: RequestInit) => api<T>(path, { method: init?.method, raw: init?.body ?? undefined }), [api]);
  const title = ar ? "التحقق من الهوية" : "Identity Checks";
  const shell = (body: React.ReactNode) => <ControlCenterShell locale={locale} active="identity" title={title} intro={ar ? "راجع أدلة هوية المرضى والممثلين وسجّل القرار." : "Review patient and representative identity evidence and record a decision."}>{body}</ControlCenterShell>;
  if (authLoading || access.loading) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (!user) return shell(signInButton(locale, () => void signIn()));
  if (!access.legacy.identityReviewer) return shell(<EmptyState title={ar ? "ليس لديك وصول إلى هذه المساحة" : "You don't have access to this area"} />);
  return shell(<div className="cc-identity"><IdentityReviewQueue api={legacyApi} locale={locale} /></div>);
}
