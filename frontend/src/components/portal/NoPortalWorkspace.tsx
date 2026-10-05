"use client";

import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { useAuth } from "@/components/AuthProvider";
import { useControlCenterAccess } from "@/components/platform-control-center/control-center-access";
import { ccHref, openableSections, pick } from "@/components/platform-control-center/control-center-nav";
import { WorkforceAdoptionPanel } from "./WorkforceAdoptionPanel";

/**
 * Landing for a signed-in account with no care-portal workspace — typically someone whose RehletShifaa role works only in
 * the Control Center. It never says "no access" to someone who has access: it lists the Control Center areas their
 * permissions open, exactly as the Control Center navigation would, and shows no case or patient data.
 */
export function NoPortalWorkspace({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const access = useControlCenterAccess();
  const { user, me, activationIssue, refreshMe, signIn } = useAuth();
  if (user && me?.pendingActions.includes("ACCEPT_WORKFORCE_ADOPTION"))
    return <WorkforceAdoptionPanel locale={locale} token={user.access_token} onAccepted={refreshMe} />;
  // STF-02: an invited person whose activation was refused (usually: two-step verification not set up yet). Nothing is
  // granted until it succeeds; signing in again lets the identity provider run its pending setup, and "Try again" re-asks.
  if (me?.pendingActions.includes("ACTIVATE_ACCOUNT")) {
    const mfa = activationIssue?.code === "MFA_ENROLMENT_REQUIRED";
    return (
      <section className="card max-w-2xl p-6 sm:p-8" aria-labelledby="no-portal-workspace-title">
        <h2 id="no-portal-workspace-title" className="title">{ar ? "أكمل إعداد حسابك" : "Finish setting up your account"}</h2>
        <p role="status" className="mt-2 text-sm leading-6 text-ink-600">{mfa
          ? (ar ? "فعّل التحقق بخطوتين لتفعيل حسابك. لن تُمنح أي صلاحية قبل ذلك." : "Set up two-step verification to activate your account. Nothing is granted until you do.")
          : (ar ? "لم نتمكن من تفعيل حسابك بعد. " : "We couldn't activate your account yet. ") + (activationIssue?.message ?? "")}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          {mfa && <button type="button" className="btn-primary" onClick={() => void signIn(true)}>{ar ? "تسجيل الدخول لإعداد التحقق" : "Sign in to set it up"}</button>}
          <button type="button" className={mfa ? "btn-secondary" : "btn-primary"} onClick={refreshMe}>{ar ? "إعادة المحاولة" : "Try again"}</button>
        </div>
      </section>
    );
  }
  if (access.loading) return <p role="status" className="text-sm text-ink-500">{ar ? "جارٍ التحقق مما يمكنك الوصول إليه…" : "Checking what you can use…"}</p>;
  // A failed capability read is not an access answer: never tell someone "nothing is set up" because a read failed.
  if (access.failed) return <p role="alert" className="text-sm text-alert-800">{ar ? "تعذّر التحقق مما يمكنك الوصول إليه. " : "We couldn't check what you can use. "}<button type="button" className="font-semibold underline" onClick={access.retry}>{ar ? "إعادة المحاولة" : "Try again"}</button></p>;
  const areas = openableSections(access);
  if (areas.length) return (
    <section className="card max-w-3xl p-6 sm:p-8" aria-labelledby="no-portal-workspace-title">
      <h2 id="no-portal-workspace-title" className="title">{ar ? "عملك في مركز التحكم" : "Your work is in the Control Center"}</h2>
      <p className="mt-2 text-sm leading-6 text-ink-600">{ar ? "لا يستخدم حسابك مساحات عمل الحالات في بوابة الرعاية. هذه هي المساحات المتاحة لك حسب دورك:" : "Your account doesn't use the care portal's case workspaces. These are the areas your role gives you:"}</p>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {areas.map((item) => (
          <li key={item.key}><Link className="block rounded-xl border border-line p-4 hover:bg-mist" href={ccHref(locale, item.path)}>
            <strong className="block text-ink-900">{pick(item.label, locale)}</strong><span className="text-sm text-ink-500">{pick(item.summary, locale)}</span>
          </Link></li>
        ))}
      </ul>
      <Link className="btn-primary mt-6 inline-flex" href={ccHref(locale)}>{ar ? "فتح مركز التحكم" : "Open the Control Center"}</Link>
    </section>
  );
  return (
    <section className="card max-w-2xl p-6 sm:p-8" aria-labelledby="no-portal-workspace-title">
      <h2 id="no-portal-workspace-title" className="title">{ar ? "لم يُجهَّز شيء لحسابك بعد" : "Nothing is set up for your account yet"}</h2>
      <p className="mt-2 text-sm leading-6 text-ink-600">{ar ? "لقد سجّلت الدخول، لكن لم تُجهَّز بعد أي مساحة عمل أو دور لهذا الحساب. إذا دُعيت للعمل مع رحلة شفاء، فقد يكون دورك بانتظار التفعيل." : "You're signed in, but no workspace or role has been set up for this account yet. If you were invited to work with RehletShifaa, your role may still be waiting to be set up."}</p>
      <p className="mt-3 text-sm leading-6 text-ink-600">{ar ? "تواصل مع الشخص الذي دعاك أو مع جهة الاتصال لدى رحلة شفاء. لا تشارك كلمة المرور مع أحد." : "Contact the person who invited you or your RehletShifaa contact. Never share your password."}</p>
    </section>
  );
}
