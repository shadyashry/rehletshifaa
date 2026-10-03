"use client";

import { useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { IdentityReviewQueue } from "@/components/portal/PortalDirectories";
import { ControlCenterShell } from "./ControlCenterShell";
import { useControlCenterAccess } from "./control-center-access";
import { useAdminApi } from "./admin-api";
import { EmptyState } from "./cc-ui";

const signInButton = (locale: Locale, signIn: () => void) => <button onClick={signIn}>{locale === "ar" ? "تسجيل الدخول الآمن" : "Sign in securely"}</button>;

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
  if (!access.can("PATIENT_IDENTITY_READ")) return shell(<EmptyState title={ar ? "ليس لديك وصول إلى هذه المساحة" : "You don't have access to this area"} />);
  return shell(<div className="cc-identity"><IdentityReviewQueue api={legacyApi} locale={locale} /></div>);
}
