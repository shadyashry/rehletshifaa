"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Building2, ClipboardCheck, Menu, ShieldCheck, ChevronLeft, ChevronRight } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { ccCopy } from "./control-center-copy";
import { AccessGovernanceNav } from "./AccessGovernanceNav";
import "./control-center.css";

export type Crumb = { label: string; href?: string };
type Section = "providers" | "operations";

/**
 * Shared shell for the Provider Control Center: sidebar navigation, breadcrumb and page header.
 * Each page owns its own loading/denied/error state; the shell is presentation-only.
 */
export function ControlCenterShell({locale,active,crumbs,title,intro,actions,children}:{locale:Locale;active:Section;crumbs:Crumb[];title:string;intro?:string;actions?:ReactNode;children:ReactNode}) {
  const t = ccCopy[locale];
  const [open, setOpen] = useState(false);
  const dir = locale === "ar" ? "rtl" : "ltr";
  const Back = dir === "rtl" ? ChevronRight : ChevronLeft;
  return (
    <div className="cc" dir={dir}>
      <nav className="cc-sidebar" aria-label={t.title}>
        <button type="button" className="cc-secondary cc-sidebar-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span><Menu size={16} aria-hidden /> {t.title}</span>
        </button>
        <div className={"cc-sidebar-body" + (open ? " cc-open" : "")}>
          <div className="cc-eyebrow"><ShieldCheck size={18} aria-hidden /> RehletShifaa</div>
          <h2>{t.nav.providers}</h2>
          <ul>
            <li><Link href={`/${locale}/portal/control-center/providers`} aria-current={active === "providers" ? "page" : undefined}>
              <Building2 size={16} aria-hidden /> {t.orgList}
            </Link></li>
          </ul>
          <h2>{t.nav.operations}</h2>
          <ul>
            <li><Link href={`/${locale}/portal/control-center/credentials`} aria-current={active === "operations" ? "page" : undefined}>
              <ClipboardCheck size={16} aria-hidden /> {t.credentialQueue}
            </Link></li>
          </ul>
          <AccessGovernanceNav locale={locale} />
          <Link className="cc-secondary" style={{ marginTop: 20, display: "inline-flex" }} href={`/${locale}/portal`}>
            <Back size={16} aria-hidden /> {t.back}
          </Link>
        </div>
      </nav>
      <main className="cc-main">
        <p className="cc-breadcrumb" aria-label="breadcrumb">
          {crumbs.map((c, i) => (
            <span key={i}>
              {i > 0 && <span aria-hidden> / </span>}
              {c.href ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
            </span>
          ))}
        </p>
        <header className="cc-header">
          <div><h1>{title}</h1>{intro && <p>{intro}</p>}</div>
          {actions}
        </header>
        {children}
      </main>
    </div>
  );
}
