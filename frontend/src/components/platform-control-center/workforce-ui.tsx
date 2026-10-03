"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { useControlCenterAccess, type ControlCenterAccess } from "./control-center-access";
import { useAdminApi, type AdminApi } from "./admin-api";
import { EmptyState, ErrorNotice, Field } from "./cc-ui";
import { FocusTrapDialog } from "./FocusTrapDialog";
import type { NavKey } from "./control-center-nav";

/** One read with loading, error and reload — the Control Center load-on-mount idiom. */
export function useRead<T>(api: AdminApi, path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    if (!path) return;
    let live = true;
    api<T>(path).then((next) => { if (live) { setData(next); setError(null); } }).catch((e) => { if (live) setError(e); });
    return () => { live = false; };
  }, [api, path, attempt]);
  return { data, error, reload };
}

/**
 * The page frame every Workforce and Access page shares: the shell, sign-in, the permission gate, and the API.
 * `allowed` only hides what the caller cannot use; the backend authorizes every call.
 */
export function WorkforcePage({ locale, active, title, intro, allowed, actions, children }: {
  locale: Locale; active: NavKey; title: string; intro: string; allowed: (a: ControlCenterAccess) => boolean; actions?: (a: ControlCenterAccess) => ReactNode;
  children: (ctx: { access: ControlCenterAccess; api: AdminApi }) => ReactNode;
}) {
  const ar = locale === "ar";
  const { user, loading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const api = useAdminApi();
  const shell = (body: ReactNode) => <ControlCenterShell locale={locale} active={active} title={title} intro={intro} actions={!loading && user && allowed(access) ? actions?.(access) : undefined}>{body}</ControlCenterShell>;
  if (loading) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (!user) return shell(<button onClick={() => void signIn()}>{ar ? "تسجيل الدخول الآمن" : "Sign in securely"}</button>);
  if (!allowed(access)) return shell(<EmptyState title={ar ? "ليس لديك وصول إلى هذه المساحة" : "You don't have access to this area"} />);
  return shell(children({ access, api }));
}

/**
 * A governed action: what will happen, any inputs, and the reason recorded in the audit trail. The action runs only
 * on submit; a failure keeps the dialog open with the error.
 */
export function ActionDialog({ locale, title, confirm, danger, children, onSubmit, onClose, needsReason = true }: {
  locale: Locale; title: string; confirm: string; danger?: boolean; children?: ReactNode; needsReason?: boolean;
  onSubmit: (reason: string) => Promise<void>; onClose: () => void;
}) {
  const ar = locale === "ar";
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { await onSubmit(reason.trim()); } catch (err) { setError(err); } finally { setBusy(false); }
  };
  return <FocusTrapDialog label={title} onClose={busy ? () => undefined : onClose}>
    <h2><bdi>{title}</bdi></h2>
    <ErrorNotice error={error} locale={locale} />
    <form onSubmit={submit}>
      {children}
      {needsReason && <Field label={ar ? "السبب" : "Reason"} hint={ar ? "يُحفظ في سجل التدقيق." : "Saved in the audit trail."} required>
        <textarea required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>}
      <div className="cc-form-actions">
        <button type="button" className="cc-secondary" disabled={busy} onClick={onClose}>{ar ? "إلغاء" : "Cancel"}</button>
        <button className={danger ? "cc-danger-button" : undefined} disabled={busy || (needsReason && !reason.trim())}>{confirm}</button>
      </div>
    </form>
  </FocusTrapDialog>;
}

export const json = (method: string, body: unknown) => ({ method, body });
