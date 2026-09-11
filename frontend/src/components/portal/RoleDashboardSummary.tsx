"use client";

import { AlertTriangle, CheckCircle2, Clock3, FolderKanban, Stethoscope, UsersRound } from "lucide-react";

import type { Locale } from "@/lib/i18n";

type SummaryCase = { status: string; coordinatorSubject?: string; assignmentStatus?: string; overdueTaskCount?: number };
type SummaryTask = { overdue: boolean; status: string; type?: string };

const completed = new Set(["CLOSED", "CANCELLED", "DECLINED", "CLINICALLY_NOT_SUITABLE"]);
const doctorAction = new Set(["CONSULTANT_ASSIGNMENT_PENDING", "CONSULTANT_REVIEW", "ARRIVAL_CONFIRMED"]);
const coordinatorAction = new Set(["RECEIVED", "INFORMATION_REQUIRED", "CLINICAL_RECOMMENDATION_READY", "PROPOSAL_PREPARATION", "REVISION_REQUESTED"]);

/** The KPI a card filters by. "" is the unfiltered baseline (all active cases). */
export type KpiFilter = "" | "action" | "unowned" | "overdue";

/** Does this case belong to the given quick filter? Shared with the queue so counts and results agree. */
export function matchesKpi(item: SummaryCase, kpi: KpiFilter, role: string) {
  if (kpi === "") return true;
  if (kpi === "overdue") return (item.overdueTaskCount ?? 0) > 0;
  if (kpi === "unowned") return role === "coordinator"
    ? !item.coordinatorSubject && item.status === "RECEIVED"
    : item.assignmentStatus === "PENDING";
  return role === "doctor" ? doctorAction.has(item.status)
    : role === "coordinator" ? coordinatorAction.has(item.status)
    : item.assignmentStatus === "PENDING";
}

/**
 * Compact operational summary whose cards are genuine quick filters, not decoration: each one is a
 * real toggle button with pressed state, and selecting it narrows the list below. Nothing here looks
 * interactive without being interactive.
 */
export function RoleDashboardSummary({ locale, role, cases, tasks, selected = "", onSelect }: {
  locale: Locale; role: string; cases: SummaryCase[]; tasks: SummaryTask[];
  selected?: KpiFilter; onSelect?: (value: KpiFilter) => void;
}) {
  const ar = locale === "ar";
  const active = cases.filter(item => !completed.has(item.status)).length; // accepted, still running
  const overdue = Math.max(
    tasks.filter(task => task.overdue && task.status !== "COMPLETED").length,
    cases.filter(item => matchesKpi(item, "overdue", role)).length,
  );
  const needsAction = cases.filter(item => matchesKpi(item, "action", role)).length;
  // A consultant's "new assignments" are work items awaiting accept/decline — pending assignments are
  // deliberately not cases yet, so they are counted from My Work rather than from the case list.
  const unowned = role === "doctor"
    ? tasks.filter(task => task.type === "CONSULTANT_ASSIGNMENT" && task.status !== "COMPLETED").length
    : cases.filter(item => matchesKpi(item, "unowned", role)).length;

  const cards: { id: KpiFilter; label: string; value: number; Icon: typeof FolderKanban; tone: string }[] = [
    { id: "", label: ar ? "حالات نشطة" : "Active", value: active, Icon: FolderKanban, tone: "bg-brand-50 text-brand-800" },
    { id: "action", label: ar ? "تحتاج إجراء" : "Need action", value: needsAction, Icon: role === "doctor" ? Stethoscope : CheckCircle2, tone: "bg-sky-50 text-sky-900" },
    { id: "unowned", label: role === "coordinator" ? (ar ? "بدون منسق" : "Unowned") : role === "doctor" ? (ar ? "تعيينات جديدة" : "New assignments") : (ar ? "تعيينات معلّقة" : "Pending"), value: unowned, Icon: UsersRound, tone: "bg-violet-50 text-violet-900" },
    { id: "overdue", label: ar ? "متأخرة" : "Overdue", value: overdue, Icon: overdue ? AlertTriangle : Clock3, tone: overdue ? "bg-alert-50 text-alert-800" : "bg-stone-100 text-ink-700" },
  ];

  return (
    <section aria-labelledby="dashboard-summary-title" className="mb-5">
      <h2 id="dashboard-summary-title" className="sr-only">{ar ? "نظرة سريعة" : "At a glance"}</h2>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {cards.map(({ id, label, value, Icon, tone }) => {
          const pressed = selected === id;
          // A zero tile is worth showing — "nothing is overdue" is the reassurance — but filtering by it
          // can only produce an empty list, so it stays a read-out rather than an action.
          const filterable = value > 0;
          return (
            <button
              key={label} type="button" aria-pressed={filterable ? pressed : undefined} disabled={!filterable}
              onClick={() => onSelect?.(pressed ? "" : id)}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-start transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
                pressed
                  ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600"
                  : filterable
                    ? "border-line bg-white hover:border-brand-300 hover:bg-brand-50/60"
                    : "border-line bg-white"}`}
            >
              <span className={`grid h-9 w-9 flex-none place-items-center rounded-lg ${tone}`}>
                <Icon size={17} aria-hidden/>
              </span>
              <span className="min-w-0">
                <span className="block text-[1.15rem] font-bold leading-6 text-ink-900">{value}</span>
                <span className="block truncate text-[0.78rem] font-semibold text-ink-500">{label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
