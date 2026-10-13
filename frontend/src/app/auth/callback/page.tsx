"use client";

import { useEffect, useState } from "react";
import { authManager, signInLocale } from "@/lib/auth-client";

const copy = {
  en: { title: "Completing secure sign-in", wait: "Please wait…", failed: "Sign-in could not be completed. Please return to the portal and try again.", back: "Return to the portal" },
  ar: { title: "جارٍ إكمال تسجيل الدخول الآمن", wait: "يرجى الانتظار…", failed: "تعذّر إكمال تسجيل الدخول. يرجى العودة إلى البوابة والمحاولة مرة أخرى.", back: "العودة إلى البوابة" },
} as const;

/**
 * Finishes the OIDC redirect and leaves no trace in history: the callback entry is replaced by the page the sign-in
 * started from. Browser Back from there passes the identity provider again, which answers an existing session with a
 * fresh callback carrying an already-used state (QA W-19); that is not a failure — the person is signed in, so they go
 * straight back to the portal in the language they signed in from.
 */
export default function AuthCallbackPage() {
  const [failed, setFailed] = useState(false);
  const [locale, setLocale] = useState<"en" | "ar">("en");
  useEffect(() => {
    const started = signInLocale() ?? (navigator.language.toLowerCase().startsWith("ar") ? "ar" : "en");
    authManager().signinRedirectCallback().then(user => {
      const state = user.state as { returnTo?: string } | undefined;
      const destination = state?.returnTo ?? `/${started}/portal`;
      setLocale(destination.startsWith("/ar/") ? "ar" : "en");
      window.location.replace(destination);
    }).catch(async () => {
      setLocale(started);
      const signedIn = await authManager().getUser().then(user => !!user && !user.expired, () => false);
      if (signedIn) { window.location.replace(`/${started}/portal`); return; }
      setFailed(true);
    });
  }, []);
  const t = copy[locale];
  return <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}><body><main className="container-site section">
    <h1 className="headline">{t.title}</h1>
    {failed
      ? <><p role="alert">{t.failed}</p><p className="mt-4"><a className="btn-primary" href={`/${locale}/portal`}>{t.back}</a></p></>
      : <p role="status">{t.wait}</p>}
  </main></body></html>;
}
