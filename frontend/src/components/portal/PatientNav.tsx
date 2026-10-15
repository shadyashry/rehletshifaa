"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import type { CareView } from "@/components/portal/MyCare";
import { useWorkCopy } from "@/components/portal/portal-copy";
import { UnreadCount } from "@/components/portal/portal-ui";
import { careViewHref, isPlainClick } from "@/components/portal/care-view";

/**
 * The patient's whole navigation: three destinations, rendered into the site header beside the account
 * menu on wider screens. Nothing else is offered until the product genuinely needs it; My Care itself
 * repeats the three as a tab bar on small screens. Each is a link to the view's address on the open case, so it opens in
 * a new tab or copies; a plain click changes the view in place.
 */
export function PatientNav({ caseId, view, unread, onView }: { caseId: string; view: CareView; unread: number; onView: (view: CareView) => void }) {
  const t = useWorkCopy().myCare.nav;
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  // The header slot exists only in the browser; binding it once after mount is the same pattern PortalAccount uses.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSlot(document.getElementById("portal-nav-slot")); }, []);
  const items = (["care", "documents", "messages"] as const).map(id => ({ id, label: t[id] }));
  // The header's pill track: resting pills in Body Ink; the current one rises to a white pill with a hairline ring.
  const nav = (
    <nav aria-label={t.label} className="hidden items-center gap-1 rounded-lg bg-mist p-1 md:flex">
      {items.map(item => (
        <a key={item.id} href={careViewHref(caseId, item.id)} aria-current={view === item.id ? "page" : undefined}
           className={`inline-flex min-h-11 items-center rounded-md px-3.5 py-2 text-[0.9375rem] font-medium transition ${view === item.id ? "bg-white text-brand-900 ring-1 ring-ink-350" : "text-ink-600 hover:text-brand-800"}`}
           onClick={event => { if (!isPlainClick(event)) return; event.preventDefault(); onView(item.id); }}>
          {item.label}
          {item.id === "messages" && unread > 0 && <UnreadCount count={unread}/>}
        </a>
      ))}
    </nav>
  );
  return slot ? createPortal(nav, slot) : null;
}
