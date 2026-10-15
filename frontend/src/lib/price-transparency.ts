import { useEffect, useState } from "react";

/** The one disclosed line the platform charges (P1-10, D-A); its stored description is English, so it is worded here. */
export const PLATFORM_FEE_CATEGORY = "PLATFORM_FEE";

export const isPlatformFee = (item: { category?: string | null }) => item.category === PLATFORM_FEE_CATEGORY;

/** Backend decision codes the proposal pages explain in the patient's own language instead of showing the message. */
export const COOLING_PERIOD = "COOLING_PERIOD";
export const FX_REAPPROVAL_REQUIRED = "FX_REAPPROVAL_REQUIRED";
export const SCOPE_CHANGE_REASON_REQUIRED = "SCOPE_CHANGE_REASON_REQUIRED";
export const QUOTE_VALIDITY_TOO_LONG = "QUOTE_VALIDITY_TOO_LONG";
/** Codes a form answers next to its own field (or in the proposal's own notice): the page banner stays quiet for them. */
export const FIELD_HANDLED_CODES: readonly string[] = [COOLING_PERIOD, FX_REAPPROVAL_REQUIRED, SCOPE_CHANGE_REASON_REQUIRED, QUOTE_VALIDITY_TOO_LONG];

/** The longest a timer can wait; a longer wait re-arms itself. */
const MAX_TIMEOUT = 2 ** 31 - 1;

/**
 * The current time, refreshed when `until` passes, so a cooling-period note turns into an available action without a
 * reload. Starts at the render's own time; nothing else ticks.
 */
export function useNow(until?: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const target = new Date(until).getTime();
    if (Number.isNaN(target)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      const wait = target - Date.now();
      if (wait <= 0) { setNow(Date.now()); return; }
      timer = setTimeout(() => { setNow(Date.now()); arm(); }, Math.min(wait + 250, MAX_TIMEOUT));
    };
    arm();
    return () => clearTimeout(timer);
  }, [until]);
  return now;
}

export type FinalQuoteState = {
  /** When the quote can be accepted, while that is still ahead; null once it has passed or when there is no cooling period. */
  acceptableFrom: string | null;
  /** The cooling period applies but its time is not known (the server refused before this page knew it). */
  coolingUnknown: boolean;
  fxPending: boolean;
  /** Accepting is not possible right now. */
  acceptBlocked: boolean;
};

/**
 * What stops a patient accepting a final quote right now, from the version's own facts and, when a decision was just
 * refused, the code the server answered with.
 */
export function finalQuoteState(
  proposal: { acceptableFrom?: string | null; fxReapprovalStatus?: string | null },
  now: number,
  refusedWith?: string | null,
): FinalQuoteState {
  const ahead = !!proposal.acceptableFrom && new Date(proposal.acceptableFrom).getTime() > now;
  const coolingUnknown = refusedWith === COOLING_PERIOD && !ahead && !proposal.acceptableFrom;
  const fxPending = proposal.fxReapprovalStatus === "PENDING" || refusedWith === FX_REAPPROVAL_REQUIRED;
  return {
    acceptableFrom: ahead ? proposal.acceptableFrom ?? null : null,
    coolingUnknown,
    fxPending,
    acceptBlocked: ahead || coolingUnknown || fxPending,
  };
}
