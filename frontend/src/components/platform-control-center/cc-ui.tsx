"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Check, CircleDot, Clock, Info, MoreHorizontal, XCircle } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import type { Tone } from "./admin-labels";

/** Status is never colour alone: every tone carries its own icon and the text label. */
export function StatusBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  const Icon = tone === "success" ? Check : tone === "warning" ? Clock : tone === "danger" ? XCircle : tone === "info" ? Info : CircleDot;
  return <span className={`cc-status cc-status-${tone}`}><Icon size={14} aria-hidden />{children}</span>;
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return <div className="cc-emptystate"><p className="cc-emptystate-title">{title}</p>{body && <p>{body}</p>}{action && <div className="cc-emptystate-action">{action}</div>}</div>;
}

/** Actionable error copy first; the technical code stays available for support, never as the headline. */
export class ControlCenterError extends Error {
  code?: string; status?: number;
  constructor(message: string, code?: string, status?: number) { super(message); this.code = code; this.status = status; }
}
export function friendlyError(error: unknown, locale: Locale, action: "load" | "save" = "save") {
  const ar = locale === "ar";
  const e = error instanceof ControlCenterError ? error : null;
  if (e?.status === 403) return ar ? "ليس لديك صلاحية لهذا الإجراء. تواصل مع مسؤول الوصول إذا كنت تحتاجها." : "You don't have permission to do this. Ask your access administrator if you need it.";
  if (e?.status === 409) return (ar ? "تغيّرت هذه المعلومات منذ فتحتها. حدّث الصفحة ثم حاول مجددًا. " : "This information changed since you opened it. Refresh and try again. ") + (e.message && e.message !== e.code ? e.message : "");
  if (e?.status === 400 || e?.status === 422) return e.message || (ar ? "بعض المعلومات غير صحيحة. راجع الحقول وحاول مجددًا." : "Some information isn't valid. Check the fields and try again.");
  if (e?.status === 503) return ar ? "الخدمة غير متاحة مؤقتًا. لم تُفقد معلوماتك — حاول بعد قليل." : "The service is temporarily unavailable. Nothing was lost — try again shortly.";
  if (action === "load") return ar ? "تعذّر تحميل هذه المعلومات. حاول مجددًا." : "We couldn't load this information. Try again.";
  return ar ? "تعذّر حفظ هذه التغييرات. لم تُفقد معلوماتك — حاول مجددًا." : "We couldn't save these changes. Your information has not been lost. Try again.";
}
export function ErrorNotice({ error, locale, action = "save", onRetry }: { error: unknown; locale: Locale; action?: "load" | "save"; onRetry?: () => void }) {
  if (!error) return null;
  const code = error instanceof ControlCenterError ? error.code : undefined;
  const raw = error instanceof Error ? error.message : String(error);
  return (
    <div role="alert" className="cc-notice cc-notice-error">
      <AlertTriangle size={18} aria-hidden />
      <div>
        <p>{error instanceof ControlCenterError ? friendlyError(error, locale, action) : raw}</p>
        {code && <p className="cc-notice-code">{locale === "ar" ? "رمز الدعم" : "Support code"}: <code dir="ltr">{code}</code></p>}
      </div>
      {onRetry && <button type="button" className="cc-secondary cc-small" onClick={onRetry}>{locale === "ar" ? "إعادة المحاولة" : "Try again"}</button>}
    </div>
  );
}
export function SuccessNotice({ children }: { children: ReactNode }) {
  return children ? <p role="status" className="cc-notice cc-notice-success"><Check size={18} aria-hidden />{children}</p> : null;
}

/** In-page section tabs (buttons) — for route-level sections use links in the sidebar instead. */
export function SectionTabs<K extends string>({ label, tabs, active, onChange, attentionLabel = "needs attention" }: { attentionLabel?: string; label: string; tabs: { key: K; label: string; count?: number; attention?: boolean }[]; active: K; onChange: (k: K) => void }) {
  return (
    <div className="cc-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.key} type="button" role="tab" id={`tab-${t.key}`} aria-selected={active === t.key} aria-controls={`panel-${t.key}`} tabIndex={active === t.key ? 0 : -1}
          onKeyDown={(e) => {
            const i = tabs.findIndex((x) => x.key === active); const rtl = document.dir === "rtl" || !!(e.currentTarget.closest("[dir=rtl]"));
            const step = e.key === "ArrowRight" ? (rtl ? -1 : 1) : e.key === "ArrowLeft" ? (rtl ? 1 : -1) : 0;
            if (step) { e.preventDefault(); const next = tabs[(i + step + tabs.length) % tabs.length]; onChange(next.key); requestAnimationFrame(() => document.getElementById(`tab-${next.key}`)?.focus()); }
          }}
          onClick={() => onChange(t.key)}>
          {t.label}{t.count !== undefined && <span className="cc-count">{t.count}</span>}{t.attention && <><span className="cc-dot" aria-hidden /><span className="cc-sr"> — {attentionLabel}</span></>}
        </button>
      ))}
    </div>
  );
}
export function TabPanel({ id, children }: { id: string; children: ReactNode }) {
  return <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`}>{children}</div>;
}

/** Wizard progress: an ordered list with the current step marked for assistive technology. */
export function WizardProgress({ steps, current, locale, onStep }: { steps: { key: string; label: string; done?: boolean; attention?: boolean }[]; current: number; locale: Locale; onStep?: (index: number) => void }) {
  return (
    <ol className="cc-progress" aria-label={locale === "ar" ? "خطوات الإعداد" : "Setup steps"}>
      {steps.map((s, i) => {
        const state = i === current ? "current" : s.done ? "done" : "todo";
        const content = <><span className="cc-progress-marker" aria-hidden>{s.done && i !== current ? <Check size={14} /> : i + 1}</span><span className="cc-progress-label">{s.label}</span>
          <span className="cc-sr">{state === "done" ? (locale === "ar" ? " — مكتملة" : " — complete") : s.attention ? (locale === "ar" ? " — تحتاج إجراء" : " — needs attention") : ""}</span></>;
        return (
          <li key={s.key} className={`cc-progress-step cc-progress-${state}${s.attention ? " cc-progress-attention" : ""}`} aria-current={i === current ? "step" : undefined}>
            {onStep ? <button type="button" className="cc-progress-button" onClick={() => onStep(i)}>{content}</button> : <span className="cc-progress-button">{content}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** Row actions grouped behind one button; destructive items are separated and visually distinct. */
export type MenuAction = { label: string; onSelect: () => void; destructive?: boolean; disabled?: boolean; href?: string };
export function ActionMenu({ label, actions }: { label: string; actions: MenuAction[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) { if (e.key === "Escape") { setOpen(false); ref.current?.querySelector<HTMLButtonElement>("button")?.focus(); } return; }
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", close);
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus());
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  const safe = actions.filter((a) => !a.destructive), danger = actions.filter((a) => a.destructive);
  if (!actions.length) return null;
  const item = (a: MenuAction, i: number) => a.href
    ? <Link key={i} role="menuitem" className="cc-menu-item" href={a.href} onClick={() => setOpen(false)}>{a.label}</Link>
    : <button key={i} type="button" role="menuitem" className={"cc-menu-item" + (a.destructive ? " cc-menu-danger" : "")} disabled={a.disabled} onClick={() => { setOpen(false); a.onSelect(); }}>{a.label}</button>;
  return (
    <div className="cc-menu" ref={ref}>
      <button type="button" className="cc-icon-button" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}><MoreHorizontal size={18} aria-hidden /></button>
      {open && <div className="cc-menu-list" role="menu" id={id} aria-label={label}
        onKeyDown={(e) => { if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return; e.preventDefault(); const items = Array.from(ref.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []); const i = items.indexOf(document.activeElement as HTMLElement); items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus(); }}>
        {safe.map(item)}{danger.length > 0 && safe.length > 0 && <hr />}{danger.map((a, i) => item(a, i + safe.length))}
      </div>}
    </div>
  );
}

/** Labelled read-only facts; technical values live in the collapsed "Technical details". */
export function Facts({ items }: { items: [string, ReactNode][] }) {
  return <dl className="cc-facts">{items.filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}
export function TechnicalDetails({ locale, items }: { locale: Locale; items: [string, ReactNode][] }) {
  return <details className="cc-technical"><summary>{locale === "ar" ? "تفاصيل تقنية" : "Technical details"}</summary><dl>{items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd><bdi dir="ltr">{v}</bdi></dd></div>)}</dl></details>;
}

export function Field({ label, hint, error, required, optionalLabel, children }: { label: string; hint?: string; error?: string; required?: boolean; optionalLabel?: string; children: ReactNode }) {
  return (
    <label className={"cc-field" + (error ? " cc-field-invalid" : "")}>
      <span className="cc-field-label">{label}{required ? <span className="cc-required" aria-hidden> *</span> : optionalLabel ? <span className="cc-optional"> ({optionalLabel})</span> : null}</span>
      {hint && <span className="cc-field-hint">{hint}</span>}
      {children}
      {error && <span className="cc-field-error" role="alert">{error}</span>}
    </label>
  );
}

/** A page section with its own heading, used instead of nested bordered cards. */
export function Section({ title, description, actions, children, id }: { title: string; description?: string; actions?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="cc-section" aria-labelledby={id ? `${id}-title` : undefined}>
      <div className="cc-section-head"><div><h2 id={id ? `${id}-title` : undefined}>{title}</h2>{description && <p>{description}</p>}</div>{actions && <div className="cc-section-actions">{actions}</div>}</div>
      {children}
    </section>
  );
}
