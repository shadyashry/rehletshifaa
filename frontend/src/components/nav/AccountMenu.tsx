"use client";

import { ChevronDown, ClipboardCheck, LogIn, UserRound } from "lucide-react";
import Link from "next/link";
import { useId } from "react";

import { useDisclosure } from "./useDisclosure";

type Labels = { trigger: string; heading: string; signIn: string; signInBody: string; status: string; statusBody: string };

/**
 * "My case": the two existing-patient destinations grouped behind one quiet control — Sign in (activated
 * account) and Check case status (Case ID + WhatsApp) — each with the one line that tells a patient which
 * is theirs. Outlined, never a second primary action beside "Start my case".
 */
export function AccountMenu({ labels, signInHref, statusHref }: { labels: Labels; signInHref: string; statusHref: string }) {
  const panelId = useId();
  const { open, rootProps, triggerProps } = useDisclosure();
  const row = "group flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-surface-pearl focus-visible:bg-surface-pearl";
  const well = "grid h-9 w-9 flex-none place-items-center rounded-lg bg-surface-clinical text-brand-700 ring-1 ring-border-clinical";

  return (
    <div {...rootProps} className="relative">
      <button
        {...triggerProps}
        type="button"
        aria-controls={panelId}
        aria-haspopup="true"
        className={`btn-outline gap-2 ${open ? "border-brand-400 bg-brand-50" : ""}`}
      >
        <UserRound size={16} strokeWidth={1.9} aria-hidden="true" />
        {labels.trigger}
        <ChevronDown size={14} strokeWidth={2} aria-hidden="true" className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute end-0 top-full z-10 mt-3 w-[19.5rem] rounded-[18px] border border-border-subtle bg-surface-default p-2 shadow-[0_28px_56px_-28px_rgba(28,51,58,0.5)] motion-safe:animate-[care-menu-in_0.18s_ease-out]"
      >
        <p className="px-3 pb-1 pt-2 text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-ink-500 rtl:text-[0.8rem] rtl:normal-case rtl:tracking-normal">{labels.heading}</p>
        <Link href={signInHref} className={row}>
          <span aria-hidden className={well}><LogIn size={16} strokeWidth={1.9} className="rtl:-scale-x-100" /></span>
          <span className="min-w-0">
            <span className="block text-[0.95rem] font-semibold text-brand-900 group-hover:text-brand-700">{labels.signIn}</span>
            <span className="block text-[0.8125rem] leading-5 text-ink-500">{labels.signInBody}</span>
          </span>
        </Link>
        <Link href={statusHref} className={row}>
          <span aria-hidden className={well}><ClipboardCheck size={16} strokeWidth={1.9} /></span>
          <span className="min-w-0">
            <span className="block text-[0.95rem] font-semibold text-brand-900 group-hover:text-brand-700">{labels.status}</span>
            <span className="block text-[0.8125rem] leading-5 text-ink-500">{labels.statusBody}</span>
          </span>
        </Link>
      </div>
    </div>
  );
}
