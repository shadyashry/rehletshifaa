"use client";

import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { useControlCenterAccess } from "@/components/platform-control-center/control-center-access";
import { NAV_ITEMS, ccHref, pick } from "@/components/platform-control-center/control-center-nav";

/**
 * Interim landing (until the Provider Workspace, UX-4) for a signed-in account with no care-portal role — typically
 * a provider-side person whose access is a RehletShifaa business role rather than an identity-system portal role.
 * It never says "no access" to someone who has access: it lists the Control Center areas the caller's own
 * capabilities open, exactly as the Control Center navigation would, and shows no case or patient data.
 */
export function NoPortalWorkspace({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const access = useControlCenterAccess();
  if (access.loading) return <p role="status" className="text-sm text-ink-500">{ar ? "جارٍ التحقق مما يمكنك الوصول إليه…" : "Checking what you can use…"}</p>;
  const areas = NAV_ITEMS.filter((item) => item.key !== "overview" && item.visible(access));
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
      <p className="mt-2 text-sm leading-6 text-ink-600">{ar ? "لقد سجّلت الدخول، لكن لم تُجهَّز بعد أي مساحة عمل أو دور لهذا الحساب. إذا دعتك جهة طبية، فقد تكون عضويتك بانتظار التأكيد." : "You're signed in, but no workspace or role has been set up for this account yet. If an organization invited you, your membership may still be waiting for confirmation."}</p>
      <p className="mt-3 text-sm leading-6 text-ink-600">{ar ? "تواصل مع الشخص الذي دعاك أو مع جهة الاتصال لدى رحلة شفاء. لا تشارك كلمة المرور مع أحد." : "Contact the person who invited you or your RehletShifaa contact. Never share your password."}</p>
    </section>
  );
}
