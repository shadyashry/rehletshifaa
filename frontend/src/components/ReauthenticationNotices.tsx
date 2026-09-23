"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { reauthenticationCopy, requestReauthentication, takeReauthenticationReturn } from "@/lib/reauthentication";

/** The action was refused only because the sign-in is not recent: say so, and let the person choose when to sign in. */
export function ReauthenticationPrompt({ locale, className = "cc-secondary cc-small" }: { locale: Locale; className?: string }) {
  const { signIn } = useAuth();
  const t = reauthenticationCopy[locale];
  return (
    <>
      <p>{t.required}</p>
      <p>{t.howTo}</p>
      <button type="button" className={className} onClick={() => void requestReauthentication(signIn)}>{t.action}</button>
    </>
  );
}

/** Shown once after the sign-in round trip, so nobody assumes the interrupted change went through. */
export function ReauthenticationReturnNotice({ locale, className = "cc-notice cc-notice-info" }: { locale: Locale; className?: string }) {
  const [show, setShow] = useState(false);
  // sessionStorage is only readable after mount; the notice appears on the first client render after return.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (takeReauthenticationReturn()) setShow(true); }, []);
  if (!show) return null;
  const t = reauthenticationCopy[locale];
  return (
    <div role="status" className={className}>
      <span>{t.returned}</span>{" "}
      <button type="button" className="cc-link" onClick={() => setShow(false)}>{t.dismiss}</button>
    </div>
  );
}
