"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { reauthenticationCopy, requestReauthentication, takeReauthenticationReturn, type PendingChange } from "@/lib/reauthentication";

/** The action was refused only because the sign-in is not recent: say so, and let the person choose when to sign in. */
export function ReauthenticationPrompt({ locale, read = false, passkey = false, className = "cc-secondary cc-small" }: { locale: Locale; read?: boolean; passkey?: boolean; className?: string }) {
  const { signIn, setUpPasskey } = useAuth();
  const t = reauthenticationCopy[locale];
  // A2b: a privileged action confirms with the passkey; someone who has none sets one up first (never an endless re-check).
  if (passkey) return (
    <>
      <p>{t.passkeyRequired}</p>
      <p>{t.passkeyHow}</p>
      <button type="button" className={className} onClick={() => void requestReauthentication(signIn)}>{t.confirmPasskey}</button>{" "}
      <button type="button" className={className} onClick={() => void setUpPasskey()}>{t.setUpPasskey}</button>
    </>
  );
  // QA W-38: a read is not a change — it is shown after confirming, and nothing typed is at stake.
  return (
    <>
      <p>{read ? t.requiredRead : t.required}</p>
      {!read && <p>{t.howTo}</p>}
      <button type="button" className={className} onClick={() => void requestReauthentication(signIn)}>{read ? t.actionRead : t.action}</button>
    </>
  );
}

/** Shown once after the sign-in round trip, so nobody assumes the interrupted change went through. */
export function ReauthenticationReturnNotice({ locale, className = "cc-notice cc-notice-info" }: { locale: Locale; className?: string }) {
  const { user } = useAuth();
  const [shown, setShown] = useState<"completed" | "abandoned" | null>(null);
  const authTime = typeof user?.profile?.auth_time === "number" ? user.profile.auth_time : undefined;
  // sessionStorage is only readable after mount; the notice appears on the first client render after return.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const back = takeReauthenticationReturn(authTime); if (back) setShown(back); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!shown) return null;
  const t = reauthenticationCopy[locale];
  return (
    <div role="status" className={className}>
      <span>{shown === "abandoned" ? t.abandoned : t.returned}</span>{" "}
      <button type="button" className="cc-link" onClick={() => setShown(null)}>{t.dismiss}</button>
    </div>
  );
}

/**
 * A2b: a privileged change the backend refused for want of a passkey. Confirming signs in again (the kept change is offered on
 * return, as for any re-check); someone without a passkey sets one up first instead of being sent round again.
 */
export function PortalPasskeyNotice({ locale, pending, className, onClose }: {
  locale: Locale; pending: PendingChange | null; className: string; onClose: () => void;
}) {
  const { signIn, setUpPasskey } = useAuth();
  const t = reauthenticationCopy[locale];
  return (
    <div role="alert" className={className}>
      <p className="font-semibold">{t.passkeyRequired}</p>
      <p className="mt-1">{t.passkeyHow}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary !min-h-9 !px-3 !text-[0.85rem]" onClick={() => void requestReauthentication(signIn, pending ?? undefined)}>{t.confirmPasskey}</button>
        <button type="button" className="btn-secondary !min-h-9 !px-3 !text-[0.85rem]" onClick={() => void setUpPasskey()}>{t.setUpPasskey}</button>
        <button type="button" className="font-semibold underline underline-offset-4" onClick={onClose}>{t.dismiss}</button>
      </div>
    </div>
  );
}

/**
 * The portal's return notice (QA #6 / W-6, #9): back from the re-check, the change that was refused is offered to send as it
 * was — one click, nothing retyped — or to discard. Without a kept change it says to repeat it. The portal clears it the
 * moment any change succeeds, so it never stands beside "Saved".
 */
export function PortalReauthenticationNotice({ locale, pending, abandoned = false, busy, onResend, onClose, className }: {
  locale: Locale; pending: PendingChange | null; abandoned?: boolean; busy: boolean; onResend: (change: PendingChange) => void; onClose: () => void; className: string;
}) {
  const t = reauthenticationCopy[locale];
  // QA W-30: back without signing in, nothing claims a sign-in happened and nothing is offered to re-send.
  if (abandoned) return (
    <div role="status" className={className}>
      <span>{t.abandoned}</span>{" "}
      <button type="button" className="ms-2 font-semibold underline underline-offset-4" onClick={onClose}>{t.dismiss}</button>
    </div>
  );
  return (
    <div role="status" className={className}>
      <span>{pending ? t.returnedPending : t.returned}</span>{" "}
      {pending && <button type="button" className="btn-primary ms-2 !min-h-9 !px-3 !text-[0.85rem]" disabled={busy} onClick={() => onResend(pending)}>{t.resend}</button>}
      <button type="button" className="ms-2 font-semibold underline underline-offset-4" onClick={onClose}>{pending ? t.discard : t.dismiss}</button>
    </div>
  );
}
