import type { ReactNode } from "react";
import { Check, CircleDot, Clock, Info, XCircle } from "lucide-react";

/** The five status tones (B1 tokens, `--color-status-*`), the same model as the Control Center's `StatusBadge`. */
export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const icons = { success: Check, warning: Clock, danger: XCircle, info: Info, neutral: CircleDot } as const;

/**
 * A status as a word on its tone, with the tone's icon: colour is never the only cue (the tints are close under
 * colour-vision deficiency). The icon is decorative; the word carries the meaning.
 */
export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const Icon = icons[tone];
  return <span className="status-badge" data-tone={tone}><Icon size={13} strokeWidth={2.25} aria-hidden className="flex-none"/>{children}</span>;
}

const attention = new Set(["INFORMATION_REQUIRED", "REVISION_REQUESTED", "EXPIRED"]);
const stopped = new Set(["CANCELLED", "DECLINED", "CLINICALLY_NOT_SUITABLE"]);
const treated = new Set(["DISCHARGED", "FOLLOW_UP"]);

/** One tone per case status, shared by the case header and the queue so the same status never reads two ways. */
export function caseStatusTone(status: string): StatusTone {
  if (attention.has(status)) return "warning";
  if (stopped.has(status)) return "danger";
  if (treated.has(status)) return "success";
  if (status === "CLOSED") return "neutral";
  return "info";
}
