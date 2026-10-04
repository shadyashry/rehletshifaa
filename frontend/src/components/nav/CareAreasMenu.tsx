"use client";

import { ArrowRight, ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { CareAreaIcon, SYSTEM_STYLES } from "@/components/care-areas/CareAreaIcon";
import type { CareAreaIconName, CareSystem } from "@/lib/care-area-catalog";

export type MenuSystem = {
  key: CareSystem;
  title: string;
  areas: readonly { slug: string; title: string; icon: CareAreaIconName; href: string }[];
};

type Labels = { trigger: string; open: string; overview: string; overviewBody: string; notSureTitle: string; notSureBody: string; send: string };

/**
 * "Care Areas" as a disclosure that opens a full-width atlas panel under the header: the six body systems
 * with every care area (same icons and tints as the Care Areas page), and a side card for the patient who
 * does not know where they fit. It opens on click or keyboard, and on hover for a mouse; it closes on
 * Escape (focus returns to the trigger), on an outside click, when focus leaves it, and on navigation.
 * The trigger keeps the "Care Areas" name; the page itself stays one link away in the panel.
 */
export function CareAreasMenu({ systems, labels, overviewHref, sendHref, activeHrefs }: {
  systems: readonly MenuSystem[];
  labels: Labels;
  overviewHref: string;
  sendHref: string;
  activeHrefs: readonly string[];
}) {
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname() ?? "";
  // Open state is tied to the route it was opened on, so following any link closes the panel.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const setOpen = (next: boolean | ((value: boolean) => boolean)) =>
    setOpenAt((current) => ((typeof next === "function" ? next(current === pathname) : next) ? pathname : null));
  const active = activeHrefs.includes(pathname);
  const areaCount = systems.reduce((sum, system) => sum + system.areas.length, 0);

  const later = (next: boolean, ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(next), ms);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenAt(null);
        trigger.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpenAt(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <div
      ref={root}
      onPointerEnter={(event) => event.pointerType === "mouse" && later(true, 90)}
      onPointerLeave={(event) => event.pointerType === "mouse" && later(false, 160)}
      onBlur={(event) => { if (!root.current?.contains(event.relatedTarget as Node)) setOpen(false); }}
    >
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="true"
        title={labels.open}
        onClick={() => { if (timer.current) clearTimeout(timer.current); setOpen((value) => !value); }}
        className={`relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-[0.95rem] font-medium transition-colors ${
          active || open ? "text-brand-900" : "text-ink-600 hover:bg-brand-50/70 hover:text-brand-800"
        } ${active ? "after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-brand-500" : ""}`}
      >
        {labels.trigger}
        <ChevronDown size={15} strokeWidth={2} aria-hidden="true" className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-full border-b border-border-subtle bg-surface-pearl shadow-[0_28px_50px_-30px_rgba(28,51,58,0.45)] motion-safe:animate-[care-menu-in_0.18s_ease-out]"
      >
        <div className="container-site grid gap-8 py-7 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-10">
          <div className="grid grid-cols-3 gap-x-6 gap-y-7">
            {systems.map((system) => {
              const style = SYSTEM_STYLES[system.key];
              return (
                <div key={system.key}>
                  <p className="flex items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-ink-500 rtl:text-[0.8rem] rtl:normal-case rtl:tracking-normal">
                    <span aria-hidden className={`h-2 w-2 rounded-full ${style.dot}`} />
                    {system.title}
                  </p>
                  <ul className="mt-2.5 grid gap-1">
                    {system.areas.map((area) => (
                      <li key={area.slug}>
                        <Link
                          href={area.href}
                          aria-current={pathname === area.href ? "page" : undefined}
                          className="group flex items-center gap-3 rounded-xl px-2 py-2 -mx-2 transition-colors hover:bg-surface-default focus-visible:bg-surface-default aria-[current=page]:bg-surface-default"
                        >
                          <span aria-hidden className={`grid h-9 w-9 flex-none place-items-center rounded-lg text-brand-800 ring-1 ${style.well} ${style.ring}`}>
                            <CareAreaIcon name={area.icon} size={17} strokeWidth={1.7} />
                          </span>
                          <span className="text-[0.9375rem] font-medium leading-snug text-brand-900 group-hover:text-brand-700">{area.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          <aside className="flex flex-col rounded-[16px] bg-surface-clinical p-5 ring-1 ring-border-clinical">
            <Link href={overviewHref} className="group rounded-xl bg-surface-default p-4 ring-1 ring-border-clinical transition-colors hover:ring-brand-300">
              <span className="flex items-center justify-between gap-3 text-[0.98rem] font-semibold text-brand-900">
                {labels.overview}
                <ArrowRight size={16} aria-hidden="true" className="text-brand-600 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" />
              </span>
              <span className="mt-1 block text-[0.8125rem] leading-5 text-ink-500">
                {labels.overviewBody.replace("{areas}", String(areaCount)).replace("{systems}", String(systems.length))}
              </span>
            </Link>
            <div className="mt-5 border-t border-border-clinical pt-5">
              <p className="text-[0.98rem] font-semibold leading-6 text-brand-900">{labels.notSureTitle}</p>
              <p className="mt-1 text-[0.875rem] leading-6 text-ink-600">{labels.notSureBody}</p>
              <Link href={sendHref} className="link-cta mt-2 text-[0.9375rem]">
                {labels.send}
                <ArrowRight size={16} aria-hidden="true" className="rtl:-scale-x-100" />
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
