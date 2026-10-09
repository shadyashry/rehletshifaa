"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink, Languages, LayoutGrid, LogOut, Menu, X } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { GuidedArc } from "@/components/Logo";
import { ReauthenticationReturnNotice } from "@/components/ReauthenticationNotices";
import { OIDC_AUTHORITY } from "@/lib/api";
import { alternateLocale, type Locale } from "@/lib/i18n";
import { swapLocale } from "@/lib/links";
import { portalViews } from "@/lib/access";
import { useControlCenterAccess } from "./control-center-access";
import { ccHref, inSidebar, navGroupOf, navItem, pick, sidebarGroups, type NavItem, type NavKey } from "./control-center-nav";
import "./control-center.css";

export type Crumb = { label: string; href?: string };

const FOCUSABLE = 'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * The one Control Center app shell: a compact top bar (brand, language, account), grouped permission-gated
 * navigation that becomes a drawer on small screens, and the standard page header — breadcrumb · stable title ·
 * one-sentence description · actions. The breadcrumb's section part comes from the navigation definition, so a page
 * passes only what sits below its section (for example a person's name). Pages own their loading/empty/error state;
 * the title passed in must not change to "Loading…".
 */
export function ControlCenterShell({ locale, active, crumbs = [], title, intro, actions, children }: {
  locale: Locale; active: NavKey; crumbs?: Crumb[]; title: string; intro?: string; actions?: ReactNode; children: ReactNode;
}) {
  const access = useControlCenterAccess();
  const ar = locale === "ar";
  const home = ar ? "مركز التحكم" : "Control Center";
  const item = navItem(active);
  const group = navGroupOf(active);
  // A page without its own sidebar line (e.g. Access summary) highlights its parent.
  const line: NavKey = item.parent && !inSidebar(item, access) ? item.parent : active;
  const groups = sidebarGroups(access);
  const [drawer, setDrawer] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closeDrawer = (restore = true) => { setDrawer(false); if (restore) toggle.current?.focus(); };

  // Drawer focus management: focus moves into the drawer, Tab stays inside it, Escape closes it and returns focus.
  useEffect(() => {
    if (!drawer) return;
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); setDrawer(false); toggle.current?.focus(); return; }
      if (e.key !== "Tab" || !panel.current) return;
      const f = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.closest("[hidden]"));
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer]);

  const trail: Crumb[] = active === "overview" ? [] : [
    { label: home, href: ccHref(locale) },
    { label: pick(group.label, locale) },
    ...(item.parent ? [{ label: pick(navItem(item.parent).label, locale), href: ccHref(locale, navItem(item.parent).path) }] : []),
    { label: pick(item.label, locale), href: ccHref(locale, item.path) },
    ...crumbs,
  ];
  const where = active === "overview" ? pick(item.label, locale) : `${pick(group.label, locale)} · ${pick(item.label, locale)}`;

  return (
    <div className={"cc" + (drawer ? " cc-drawer-open" : "")} dir={ar ? "rtl" : "ltr"}>
      <a className="cc-skip" href="#cc-main">{ar ? "تخطَّ إلى المحتوى" : "Skip to content"}</a>
      <header className="cc-topbar">
        <button ref={toggle} type="button" className="cc-menu-button" aria-expanded={drawer} aria-controls="cc-sidebar" onClick={() => (drawer ? closeDrawer() : setDrawer(true))}>
          <Menu size={20} aria-hidden /><span className="cc-sr">{ar ? "قائمة التنقل" : "Navigation menu"}</span>
        </button>
        <Link className="cc-brand" href={ccHref(locale)} aria-label={`RehletShifaa — ${home}`}>
          <GuidedArc size={26} />
          <span className="cc-brand-name" lang="en" dir="ltr">Rehlet<span>Shifaa</span></span>
          <span className="cc-brand-area">{home}</span>
        </Link>
        <p className="cc-topbar-where" aria-hidden>{where}</p>
        <div className="cc-topbar-end">
          <LanguageLink locale={locale} />
          <AccountMenu locale={locale} />
        </div>
      </header>
      <div className="cc-frame">
        {drawer && <div className="cc-backdrop" onClick={() => closeDrawer(false)} aria-hidden />}
        <nav id="cc-sidebar" className="cc-sidebar" aria-label={home}>
          <div ref={panel} className="cc-sidebar-inner">
            <div className="cc-drawer-head">
              <span>{home}</span>
              <button type="button" className="cc-icon-button" onClick={() => closeDrawer()} aria-label={ar ? "إغلاق القائمة" : "Close menu"}><X size={18} aria-hidden /></button>
            </div>
            <NavTree locale={locale} groups={groups} line={line} onNavigate={() => closeDrawer(false)} />
            {access.loading && <ul className="cc-nav-skeleton" role="status" aria-label={ar ? "جارٍ تحميل الأقسام…" : "Loading sections…"}><li /><li /><li /></ul>}
            {!access.loading && access.failed && <p className="cc-nav-failed" role="alert">{ar ? "تعذّر تحميل بعض الأقسام." : "Some sections couldn't be loaded."} <button type="button" className="cc-link" onClick={access.retry}>{ar ? "إعادة المحاولة" : "Try again"}</button></p>}
          </div>
        </nav>
        <main className="cc-main" id="cc-main" tabIndex={-1}>
          {trail.length > 1 && <nav aria-label={ar ? "مسار التنقل" : "Breadcrumb"} className="cc-breadcrumb">
            <ol>
              {trail.map((c, i) => {
                const last = i === trail.length - 1;
                return <li key={i}>{c.href && !last ? <Link href={c.href}>{c.label}</Link> : <span aria-current={last ? "page" : undefined}>{c.label}</span>}</li>;
              })}
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
    </div>
  );
}

/**
 * Grouped navigation. The group holding the current page starts expanded; the others stay collapsed until opened, so
 * the sidebar reads as the handful of business areas first. A group with a single line for this caller is one link
 * named after the group (no heading over a lone item).
 */
function NavTree({ locale, groups, line, onNavigate }: { locale: Locale; groups: ReturnType<typeof sidebarGroups>; line: NavKey; onNavigate: () => void }) {
  const currentGroup = groups.find((g) => g.items.some((i) => i.key === line))?.key;
  const [open, setOpen] = useState<Set<string>>(() => new Set(currentGroup ? [currentGroup] : []));
  // Navigating into another group opens it (others stay as the person left them); adjusted while rendering.
  const [openedFor, setOpenedFor] = useState(currentGroup);
  if (openedFor !== currentGroup) { setOpenedFor(currentGroup); if (currentGroup && !open.has(currentGroup)) setOpen(new Set(open).add(currentGroup)); }
  const base = useId();
  const link = (i: NavItem, label: string, Icon?: typeof Menu) => (
    <Link href={ccHref(locale, i.path)} aria-current={i.key === line ? "page" : undefined} onClick={onNavigate}>
      {Icon && <Icon size={18} aria-hidden />}<span>{label}</span>
    </Link>
  );
  return (
    <ul className="cc-nav">
      {groups.map((g) => {
        const Icon = g.icon;
        if (g.items.length === 1) return <li key={g.key} className="cc-nav-single">{link(g.items[0], pick(g.key === "home" ? g.items[0].label : g.label, locale), Icon)}</li>;
        const expanded = open.has(g.key);
        const id = `${base}-${g.key}`;
        return (
          <li key={g.key} className={"cc-nav-group" + (g.key === currentGroup ? " cc-nav-group-current" : "")}>
            <button type="button" className="cc-nav-heading" aria-expanded={expanded} aria-controls={id}
              onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}>
              <Icon size={18} aria-hidden /><span>{pick(g.label, locale)}</span><ChevronDown size={16} aria-hidden className="cc-nav-chevron" />
            </button>
            <ul id={id} hidden={!expanded}>
              {g.items.map((i) => <li key={i.key}>{link(i, pick(i.label, locale))}</li>)}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

/** Switches language on the same page, keeping the query (a selected organization, tab or clinician). */
const noSubscription = () => () => {};

function LanguageLink({ locale }: { locale: Locale }) {
  const target = alternateLocale(locale);
  const here = () => swapLocale(window.location.pathname, target) + window.location.search;
  // The current page in the other language, read from the URL (the server renders the section root). Pages update their
  // query with router.replace, so the link is refreshed again whenever it is about to be used.
  const initial = useSyncExternalStore(noSubscription, here, () => ccHref(target));
  const [used, setHref] = useState<string | null>(null);
  const href = used ?? initial;
  return (
    <Link className="cc-topbar-link" href={href} hrefLang={target} lang={target} onMouseEnter={() => setHref(here())} onFocus={() => setHref(here())} onPointerDown={() => setHref(here())}>
      <Languages size={17} aria-hidden /><span>{target === "ar" ? "العربية" : "English"}</span>
    </Link>
  );
}

/** Who is signed in, the way back to their workspace (when they have one), account security and sign-out. */
function AccountMenu({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const { user, me, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); button.current?.focus(); } };
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  if (!user) return null;
  const profile = user.profile as { name?: string; preferred_username?: string; email?: string };
  const name = profile.name ?? profile.preferred_username ?? profile.email ?? "";
  const initials = name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "•";
  const hasWorkspace = portalViews(me).length > 0;
  const label = ar ? "الحساب" : "Account";
  return (
    <div className="cc-account" ref={root}>
      <button ref={button} type="button" className="cc-account-button" aria-expanded={open} aria-controls="cc-account-menu" aria-label={`${label}: ${name}`} onClick={() => setOpen(!open)}>
        <span className="cc-avatar" aria-hidden>{initials}</span>
      </button>
      {open && <div id="cc-account-menu" className="cc-account-menu">
        <div className="cc-account-who"><strong>{name}</strong>{profile.email && profile.email !== name && <bdi dir="ltr">{profile.email}</bdi>}</div>
        <ul>
          {hasWorkspace && <li><Link href={`/${locale}/portal`}><LayoutGrid size={17} aria-hidden />{ar ? "مساحة عملي" : "My workspace"}</Link></li>}
          <li><a href={`${OIDC_AUTHORITY}/account?ui_locales=${locale}`} target="_blank" rel="noreferrer"><ExternalLink size={17} aria-hidden />{ar ? "كلمة المرور وأمان الحساب" : "Password & account security"}</a></li>
          <li><button type="button" onClick={() => void signOut()}><LogOut size={17} aria-hidden />{ar ? "تسجيل الخروج" : "Sign out"}</button></li>
        </ul>
      </div>}
    </div>
  );
}
