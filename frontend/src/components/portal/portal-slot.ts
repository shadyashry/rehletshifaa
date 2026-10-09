"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * The page-frame element a header popover renders into (`#portal-account-slot`). Read from the DOM rather than stored by
 * an effect: React checks the snapshot again once the component has mounted, so the slot appears right after the first commit.
 */
export function usePortalSlot(id: string): HTMLElement | null {
  return useSyncExternalStore(subscribe, () => document.getElementById(id), () => null);
}
