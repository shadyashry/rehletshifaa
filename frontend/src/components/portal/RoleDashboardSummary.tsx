"use client";

import { useId } from "react";

import { useWorkCopy } from "@/components/portal/portal-copy";
import type { Locale } from "@/lib/i18n";
import { plural } from "@/lib/portal-labels";

type SummaryCase = { status: string; coordinatorSubject?: string; assignmentStatus?: string; overdueTaskCount?: number };
type SummaryTask = { overdue: boolean; status: string; type?: string };

const doctorAction = new Set(["CONSULTANT_ASSIGNMENT_PENDING", "CONSULTANT_REVIEW", "ARRIVAL_CONFIRMED"]);
const coordinatorAction = new Set(["RECEIVED", "INFORMATION_REQUIRED", "CLINICAL_RECOMMENDATION_READY", "PROPOSAL_PREPARATION", "REVISION_REQUESTED"]);

/** The count a summary item filters by. "" is the unfiltered baseline (every case in the view). */
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
 * The staff home's numbers as one line of text, not a tile grid: only the counts that are not zero, each one a toggle
 * that narrows the list below to those cases. When nothing is owed the line says so in words. While the queue loads it
 * shows no numbers at all, so a zero never flashes before the real count.
 */
export function RoleDashboardSummary({ locale, role, cases, tasks, loading = false, selected = "", onSelect }: {
  locale: Locale; role: string; cases: SummaryCase[]; tasks: SummaryTask[]; loading?: boolean;
  selected?: KpiFilter; onSelect?: (value: KpiFilter) => void;
}) {
  const work = useWorkCopy();
  const t = work.summary;
  const hintId = useId();
  const overdue = Math.max(
    tasks.filter(task => task.overdue && task.status !== "COMPLETED").length,
    cases.filter(item => matchesKpi(item, "overdue", role)).length,
  );
  const needsAction = cases.filter(item => matchesKpi(item, "action", role)).length;
  // A consultant's new assignments are work items awaiting accept/decline — pending assignments are deliberately not
  // cases yet, so they are counted from My work. Operations and finance read "pending" as their "needs action" already.
  const unowned = role === "doctor"
    ? tasks.filter(task => task.type === "CONSULTANT_ASSIGNMENT" && task.status !== "COMPLETED").length
    : role === "coordinator" ? cases.filter(item => matchesKpi(item, "unowned", role)).length : 0;

  // Zero counts are left out — except the one that is filtering the list, so it can always be switched off again.
  const shown = (id: KpiFilter, count: number) => count > 0 || selected === id;
  const items: { id: KpiFilter; text: string; alert?: boolean }[] = [];
  if (shown("action", needsAction)) items.push({ id: "action", text: plural(locale, needsAction, work.plural.needAction) });
  if (shown("unowned", unowned)) items.push({ id: "unowned", text: plural(locale, unowned, role === "doctor" ? work.plural.newAssignments : work.plural.unownedCases) });
  if (shown("overdue", overdue)) items.push({ id: "overdue", text: plural(locale, overdue, work.plural.overdueCases), alert: overdue > 0 });

  return (
    <section aria-labelledby="dashboard-summary-title" className="mb-6 min-h-11">
      <h2 id="dashboard-summary-title" className="sr-only">{t.title}</h2>
      {loading ? null : items.length === 0 ? (
        <p className="flex min-h-11 items-center text-[0.9375rem] text-ink-600">{t.nothing}</p>
      ) : (
        <>
          <p id={hintId} className="sr-only">{t.hint}</p>
          <ul className="flex flex-wrap items-center gap-x-5 text-[0.9375rem]">
            {items.map(item => {
              const pressed = selected === item.id;
              return (
                <li key={item.id}>
                  <button type="button" aria-pressed={pressed} aria-describedby={hintId}
                          onClick={() => onSelect?.(pressed ? "" : item.id)}
                          className={`min-h-11 rounded-md font-semibold underline decoration-2 underline-offset-[6px] transition ${
                            item.alert ? "text-alert-700" : "text-brand-800"} ${pressed ? "decoration-current" : "decoration-line-strong hover:decoration-current"}`}>
                    {item.text}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
