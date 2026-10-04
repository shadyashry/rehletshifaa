"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Shared behaviour for the header's disclosure menus. Open state is tied to the route it was opened on, so
 * following any link closes it; Escape closes and returns focus to the trigger; a pointer press outside or
 * focus leaving the root closes it; `hover` opens and closes with a short intent delay for a mouse only.
 */
export function useDisclosure() {
  const pathname = usePathname() ?? "";
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = (next: boolean) => setOpenAt(next ? pathname : null);
  const clear = () => { if (timer.current) clearTimeout(timer.current); };
  const later = (next: boolean, ms: number) => { clear(); timer.current = setTimeout(() => set(next), ms); };

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

  useEffect(() => clear, []);

  return {
    open,
    pathname,
    rootProps: {
      ref: root,
      onBlur: (event: React.FocusEvent) => { if (!root.current?.contains(event.relatedTarget as Node)) setOpenAt(null); },
    },
    hoverProps: {
      onPointerEnter: (event: React.PointerEvent) => { if (event.pointerType === "mouse") later(true, 90); },
      onPointerLeave: (event: React.PointerEvent) => { if (event.pointerType === "mouse") later(false, 160); },
    },
    triggerProps: {
      ref: trigger,
      "aria-expanded": open,
      onClick: () => { clear(); set(!open); },
    },
  };
}
