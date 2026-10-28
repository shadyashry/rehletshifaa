import type { ReactNode } from "react";

/**
 * The portal page: paper throughout, so white cards read as cards (the Two Surfaces rule; no wash behind the staff side
 * either, UX 2-4). The h1 is the page's place and takes the focus from code when a view changes under the person;
 * `titleHidden` keeps it for assistive technology where the page names itself visibly (a case's cover). Shared by the
 * portal and the Virtual Clinic (UX 3-3), so both pages are one shell.
 */
export function PortalFrame({ title, subtitle, titleHidden = false, nav, children }: {
  title: string; subtitle: string; titleHidden?: boolean;
  /** The phone copy of the staff navigation: above the heading, where the place is chosen before it is named. */
  nav?: ReactNode; children?: ReactNode;
}) {
  return <section className="portal-shell bg-mist"><div className="container-site">{nav}<h1 id="portal-title" tabIndex={-1} className={titleHidden ? "sr-only" : "headline scroll-mt-28 rounded-sm focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600"}>{title}</h1>{subtitle && <p className="mt-2 max-w-3xl text-sm text-ink-600">{subtitle}</p>}<div className={titleHidden ? undefined : subtitle ? "mt-6" : "mt-2"}>{children}</div></div></section>;
}
