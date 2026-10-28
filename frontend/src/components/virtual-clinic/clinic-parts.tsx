import { useId, type ReactNode } from "react";
import { AlertTriangle, Check } from "lucide-react";

/**
 * One part of a Virtual Clinic section (UX 3-3): a heading and its content on the section's one white sheet, parted from the
 * next by a hairline (the sheet is `divide-y`), never a card inside the card.
 */
export function Part({ title, lead, children }: { title?: string; lead?: string; children?: ReactNode }) {
  const id = useId();
  return <section aria-labelledby={title ? id : undefined} className="py-5 first:pt-0 last:pb-0">
    {title && <h2 id={id} className="text-[1.0625rem] font-bold text-brand-900">{title}</h2>}
    {lead && <p className={`${title ? "mt-1" : ""} max-w-[70ch] text-[0.9375rem] leading-6 text-ink-600`}>{lead}</p>}
    {children}
  </section>;
}

/** A label above a fact, set without tracking or capitals so it reads the same in Arabic. */
export function Fact({ label, children }: { label: string; children?: ReactNode }) {
  return <div className="min-w-0"><dt className="text-[0.8125rem] font-semibold text-ink-500">{label}</dt><dd className="mt-0.5 font-semibold text-ink-800">{children || "—"}</dd></div>;
}

/** Notices are hairline lines, not tinted panels: the drawn icon and the words carry the tone (the portal's NOTICE/ALERT). */
export function AlertLine({ title, children, role = "alert" }: { title?: string; children?: ReactNode; role?: "alert" | "status" }) {
  return <div role={role} className="flex items-start gap-2.5 border-y border-alert-200 py-3 text-alert-800">
    <AlertTriangle size={18} aria-hidden className="mt-0.5 flex-none"/>
    <div className="min-w-0 text-[0.9375rem] leading-6">{title && <p className="font-bold">{title}</p>}{children}</div>
  </div>;
}

export function DoneLine({ children }: { children: ReactNode }) {
  return <p role="status" className="flex items-start gap-2 border-y border-line py-3 text-[0.9375rem] font-semibold leading-6 text-brand-800"><Check size={16} aria-hidden className="mt-1 flex-none"/>{children}</p>;
}

/** A quiet text action with a 44px target; the visible word may be short when `label` names what it acts on. */
export const QUIET = "inline-flex min-h-11 items-center gap-1.5 font-semibold text-brand-700 underline decoration-line-strong underline-offset-4 hover:decoration-current disabled:cursor-not-allowed disabled:text-ink-500";
