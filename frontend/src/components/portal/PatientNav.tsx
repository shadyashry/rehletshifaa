"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import type { Locale } from "@/lib/i18n";
import type { CareView } from "@/components/portal/MyCare";

/**
 * The patient's whole navigation: three destinations, rendered into the site header beside the account
 * menu on wider screens. Nothing else is offered until the product genuinely needs it; My Care itself
 * repeats the three as a tab bar on small screens.
 */
export function PatientNav({ locale, view, unread, onView }: { locale: Locale; view: CareView; unread: number; onView: (view: CareView) => void }) {
  const ar = locale === "ar";
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  // The header slot exists only in the browser; binding it once after mount is the same pattern PortalAccount uses.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSlot(document.getElementById("portal-nav-slot")); }, []);
  const items: { id: CareView; label: string }[] = [
    { id: "care", label: ar ? "رعايتي" : "My Care" }, { id: "documents", label: ar ? "المستندات" : "Documents" }, { id: "messages", label: ar ? "الرسائل" : "Messages" },
  ];
  const nav = (
    <nav aria-label={ar ? "رعايتي" : "My Care"} className="hidden items-center gap-1 md:flex">
      {items.map(item => (
        <button key={item.id} type="button" aria-current={view === item.id ? "page" : undefined}
                className={`rounded-lg px-3 py-2 text-[0.9rem] font-semibold transition ${view === item.id ? "bg-brand-50 text-brand-800" : "text-ink-600 hover:bg-mist hover:text-brand-800"}`}
                onClick={() => onView(item.id)}>
          {item.label}
          {item.id === "messages" && unread > 0 && <span className="ms-1.5 rounded-full bg-brand-600 px-1.5 text-[0.7rem] text-white" aria-label={ar ? `${unread} رسائل غير مقروءة` : `${unread} unread`}>{unread}</span>}
        </button>
      ))}
    </nav>
  );
  return slot ? createPortal(nav, slot) : null;
}
