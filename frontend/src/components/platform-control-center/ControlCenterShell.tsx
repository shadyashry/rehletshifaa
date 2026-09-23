"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Menu, ShieldCheck, X } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { useControlCenterAccess } from "./control-center-access";
import { ReauthenticationReturnNotice } from "@/components/ReauthenticationNotices";
import { NAV_GROUPS, ccHref, pick, type NavKey } from "./control-center-nav";
import "./control-center.css";

export type Crumb = { label: string; href?: string };
/** Older section names kept so every existing page keeps compiling while it moves to the new navigation keys. */
type LegacySection = "providers" | "operations" | "journeys" | "coordination";
const legacyKey: Record<LegacySection, NavKey> = { providers: "organizations", operations: "credentials", journeys: "journeys", coordination: "coordination" };

/**
 * The one Control Center shell: grouped, permission-gated navigation, a breadcrumb, and a standard page header
 * (title · one-sentence description · actions). Pages own their own loading/denied/error state.
 */
export function ControlCenterShell({ locale, active, crumbs, title, intro, actions, children }: {
  locale: Locale; active: NavKey | LegacySection; crumbs: Crumb[]; title: string; intro?: string; actions?: ReactNode; children: ReactNode;
}) {
  const access = useControlCenterAccess();
  const [open, setOpen] = useState(false);
  const ar = locale === "ar";
  const dir = ar ? "rtl" : "ltr";
  const Back = ar ? ChevronRight : ChevronLeft;
  const current: NavKey = (legacyKey as Record<string, NavKey>)[active] ?? (active as NavKey);
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => i.visible(access)) })).filter((g) => g.items.length);
  const currentLabel = groups.flatMap((g) => g.items).find((i) => i.key === current);
  const home = ar ? "مركز التحكم" : "Control Center";
  return (
    <div className="cc" dir={dir}>
      <a className="cc-skip" href="#cc-main">{ar ? "تخطَّ إلى المحتوى" : "Skip to content"}</a>
      <nav className="cc-sidebar" aria-label={home}>
        <div className="cc-brand"><ShieldCheck size={20} aria-hidden /><span>{home}</span></div>
        <button type="button" className="cc-sidebar-toggle" aria-expanded={open} aria-controls="cc-nav-body" onClick={() => setOpen(!open)}>
          {open ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
          <span>{ar ? "القائمة" : "Menu"}{currentLabel ? <span className="cc-toggle-current"> · {pick(currentLabel.label, locale)}</span> : null}</span>
        </button>
        <div id="cc-nav-body" className={"cc-sidebar-body" + (open ? " cc-open" : "")}>
          {groups.map((g) => (
            <div key={g.key} className="cc-nav-group">
              {g.label[0] && <p className="cc-nav-heading" id={`cc-nav-${g.key}`}>{pick(g.label, locale)}</p>}
              <ul aria-labelledby={g.label[0] ? `cc-nav-${g.key}` : undefined}>
                {g.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.key}>
                      <Link href={ccHref(locale, item.path)} aria-current={item.key === current ? "page" : undefined} onClick={() => setOpen(false)}>
                        <Icon size={17} aria-hidden /><span>{pick(item.label, locale)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {access.loading && <p className="cc-nav-loading" role="status">{ar ? "جارٍ تحميل الأقسام…" : "Loading sections…"}</p>}
          <Link className="cc-nav-exit" href={`/${locale}/portal`}><Back size={16} aria-hidden />{ar ? "العودة إلى مساحة العمل" : "Back to my workspace"}</Link>
        </div>
      </nav>
      <main className="cc-main" id="cc-main" tabIndex={-1}>
        {crumbs.length > 1 && <nav aria-label={ar ? "مسار التنقل" : "Breadcrumb"} className="cc-breadcrumb">
          <ol>
            {crumbs.map((c, i) => (
              <li key={i}>
                {c.href && i < crumbs.length - 1 ? <Link href={c.href}>{c.label}</Link> : <span aria-current={i === crumbs.length - 1 ? "page" : undefined}>{c.label}</span>}
              </li>
            ))}
          </ol>
        </nav>}
        <header className="cc-header">
          <div className="cc-header-text"><h1>{title}</h1>{intro && <p>{intro}</p>}</div>
          {actions && <div className="cc-header-actions">{actions}</div>}
        </header>
        <ReauthenticationReturnNotice locale={locale} />
        {children}
      </main>
    </div>
  );
}

/** Breadcrumb helper: every Control Center trail starts at the Overview. */
export function ccCrumbs(locale: Locale, ...rest: Crumb[]): Crumb[] {
  return [{ label: locale === "ar" ? "مركز التحكم" : "Control Center", href: ccHref(locale) }, ...rest];
}
