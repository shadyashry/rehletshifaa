"use client";

import { ArrowRight, CalendarClock, CheckCheck, Clock3, FileText } from "lucide-react";

import { useWorkCopy } from "@/components/portal/portal-copy";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { useRovingList } from "@/components/portal/StaffShortcuts";
import { intlLocale, type Locale } from "@/lib/i18n";
import { careAreaLabel, coordinatorLabel, patientNameLabel, plural, priorityLabel, waitingLabel, workItemText, type WorkItemCopy } from "@/lib/portal-labels";

export type WorkItem = {
  id: string; caseId: string; caseNumber: string; patientName: string | null; caseStatus: string;
  waitingOn: string | null; careCategory?: string | null; coordinatorSubject?: string | null; coordinatorName?: string | null; documentCount?: number;
  type: string; title: string; context: string | null; priority: string;
  status: string; blocking: boolean; dueAt: string | null; overdue: boolean; createdAt: string; version: number;
  /** The wording code and parameters; the English `title`/`context` are the fallback for codes this page does not know. */
  copy?: WorkItemCopy | null;
};

/**
 * My Work — the primary operational view: every open action assigned to me, ordered by what matters first.
 *
 * <p>Each row is a real work item, independent of case status: it stays open until the work is done, and
 * reading the matching notification does not clear it.
 *
 * <p>Rows are a hairline list with one quiet action each. Only an overdue or urgent first item earns the filled
 * button, so the page never shows a column of identical primaries. When it is due and how long it has waited sit with the
 * action on wide screens, so the eye goes date, then action. An empty list points to the next useful place; the first load
 * shows the list's shape so the page does not jump.
 *
 * <p>The list is one tab stop (UX 2-2): ↑/↓, Home/End and `j`/`k` move between rows, Enter opens the row's case.
 */
export function MyWork({ locale, role, subject, items, busy, onOpen, teamWaiting = 0, onTeamQueue, labelledBy }: {
  locale: Locale; role?: string; items: WorkItem[]; busy: boolean; onOpen: (caseId: string) => void;
  /** The viewer, so their own case reads "You" as it does in the queue. */
  subject?: string;
  /** New cases nobody owns yet (coordinators), offered as the next place to look when nothing is assigned. */
  teamWaiting?: number; onTeamQueue?: () => void;
  /** The page's heading that names this view (UX 2-4: the view's name is the page's place, said once). */
  labelledBy?: string;
}) {
  const work = useWorkCopy();
  const t = work.myWork;
  const roving = useRovingList(items.map(item => item.id));

  return (
    <section aria-labelledby={labelledBy} aria-busy={busy} className="mb-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        {/* Finance's queue also holds its team's pool (deposits to record), not only work assigned to them (QA W-44). */}
        <p className="text-sm text-ink-500">{role === "finance" ? t.hintTeam : t.hint}</p>
        <p role="status" className={busy ? "text-sm text-ink-500" : "sr-only"}>{busy ? t.loading : items.length ? plural(work.locale, items.length, work.plural.workItems) : ""}</p>
      </div>

      {busy && items.length === 0 ? (
        <WorkSkeleton/>
      ) : items.length === 0 ? (
        <div className="mt-4 flex items-start gap-4 border-y border-line py-5 text-[0.9375rem]">
          <span aria-hidden className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-mist-deep text-brand-700"><CheckCheck size={18}/></span>
          <div className="min-w-0 pt-1.5">
            <p className="font-semibold text-ink-900">{t.empty}</p>
            {teamWaiting > 0 && onTeamQueue
              ? <button type="button" className="mt-1 inline-flex min-h-11 items-center gap-1.5 font-semibold text-brand-700 underline decoration-line-strong underline-offset-4 hover:decoration-current" onClick={onTeamQueue}>
                  {plural(work.locale, teamWaiting, work.plural.teamWaiting)}<ArrowRight size={16} className="rtl:rotate-180" aria-hidden/>
                </button>
              : <p className="mt-1 text-ink-600">{t.emptyHint}</p>}
          </div>
        </div>
      ) : (
        <>{roving.hint}<ul {...roving.listProps} className="mt-4 divide-y divide-line border-y border-line">
          {items.map((item, index) => {
            const lead = index === 0 && (item.overdue || item.priority === "URGENT");
            const titleId = `work-item-${item.id}`;
            const text = workItemText(item, locale, work);
            return (
            <li key={item.id} data-row={item.id} data-case={item.caseId}>
              <article aria-labelledby={titleId} className="flex flex-col gap-3 py-4 transition-colors has-[[data-roving-primary]:focus-visible]:bg-brand-50 sm:flex-row sm:items-center sm:gap-6">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <PriorityChip priority={item.priority} label={priorityLabel(item.priority, work.priority)}/>
                    {item.overdue && <StatusBadge tone="danger">{t.overdue}</StatusBadge>}
                    {item.blocking && <StatusBadge tone="info">{t.blocking}</StatusBadge>}
                    <span className="text-[0.8125rem] font-semibold text-brand-700" dir="ltr">{item.caseNumber}</span>
                    {item.patientName && <bdi className="truncate text-[0.8125rem] font-semibold text-ink-700">{patientNameLabel(item.patientName, work)}</bdi>}
                  </div>
                  {/* The backend titles work in English; Arabic shows the work type in Arabic, English keeps the specific title. */}
                  <h2 id={titleId} dir="auto" className="mt-2 font-bold leading-6 text-ink-900">{text.title}</h2>
                  {/* Enough case identity to act without opening it first. */}
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-ink-600">
                    {item.careCategory && <span>{t.care}: <strong className="font-semibold text-ink-800">{careAreaLabel(item.careCategory, work.careAreas)}</strong></span>}
                    {(item.coordinatorSubject || item.coordinatorName) && <span>{t.coordinator}: <strong className="font-semibold text-ink-800"><bdi>{coordinatorLabel(item, subject, work.queue)}</bdi></strong></span>}
                    {!!item.documentCount && <span className="inline-flex items-center gap-1"><FileText size={12} aria-hidden/>{plural(work.locale, item.documentCount, work.plural.documents)}</span>}
                  </p>
                  {text.context && <p dir="auto" className="mt-1 line-clamp-2 text-sm leading-6 text-ink-600">{text.context}</p>}
                  {item.waitingOn && item.waitingOn !== "NONE" && <p className="mt-2 text-[0.8125rem] text-ink-500">{work.waiting.label}: {waitingLabel(item.waitingOn, work.waiting, { role, holdsWork: true })}</p>}
                </div>
                {/* When it is due and how long it has waited sit with the action, so the eye goes date, then action. */}
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 sm:flex-none sm:flex-col sm:items-end sm:gap-1.5 sm:text-end">
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.8125rem] text-ink-500 sm:flex-col sm:items-end">
                    {item.dueAt && (
                      <span className={`inline-flex items-center gap-1 ${item.overdue ? "font-semibold text-alert-700" : "font-semibold text-ink-800"}`}>
                        <CalendarClock size={13} aria-hidden/>{t.due}: {new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short" }).format(new Date(item.dueAt))}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1"><Clock3 size={13} aria-hidden/>{age(item.createdAt, locale)}</span>
                  </p>
                  <button type="button" {...roving.primary(item.id)}
                          className={lead ? "btn-primary shrink-0" : "inline-flex min-h-11 shrink-0 items-center gap-1.5 font-semibold text-brand-700 underline decoration-line-strong underline-offset-4 hover:decoration-current"}
                          onClick={() => onOpen(item.caseId)}>
                    {item.type==="CONSULTANT_ASSIGNMENT"?t.reviewAssignment:t.open}
                    {/* Every row repeats the same action word; the name also says which work it opens. */}
                    <span className="sr-only">{locale === "ar" ? "، " : ": "}{text.title}{locale === "ar" ? "، " : ", "}{item.caseNumber}</span><ArrowRight size={16} className="rtl:rotate-180" aria-hidden/>
                  </button>
                </div>
              </article>
            </li>
            );
          })}
        </ul></>
      )}
    </section>
  );
}

/** While the first load runs, the list's shape stands in for it (hairline rows), so the page does not jump when the work arrives. */
function WorkSkeleton() {
  return (
    <ul aria-hidden className="mt-4 divide-y divide-line border-y border-line">
      {[0, 1, 2].map(row => (
        <li key={row} className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:gap-6">
          <div className="min-w-0 flex-1 space-y-2.5 motion-safe:animate-pulse">
            <div className="h-4 w-40 rounded bg-mist-deep"/>
            <div className="h-5 w-3/4 max-w-md rounded bg-mist-deep"/>
            <div className="h-3.5 w-1/2 max-w-xs rounded bg-mist-deep"/>
          </div>
          <div className="h-4 w-24 rounded bg-mist-deep motion-safe:animate-pulse"/>
        </li>
      ))}
    </ul>
  );
}

/**
 * Words, not the enum: no uppercase styling, so "Normal" never reads as the raw value "NORMAL". Only a priority that
 * changes the order is marked — urgent as danger, high as warning, low as plain text — and Normal, the
 * default for most rows, carries no chip at all.
 */
function PriorityChip({ priority, label }: { priority: string; label: string }) {
  if (priority === "URGENT") return <StatusBadge tone="danger">{label}</StatusBadge>;
  if (priority === "HIGH") return <StatusBadge tone="warning">{label}</StatusBadge>;
  if (priority === "NORMAL") return null;
  return <span className="text-[0.8125rem] font-semibold text-ink-600">{label}</span>;
}


function age(iso: string, locale: Locale) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  const format = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  if (minutes < 60) return format.format(-Math.max(minutes, 1), "minute");
  if (minutes < 1440) return format.format(-Math.floor(minutes / 60), "hour");
  return format.format(-Math.floor(minutes / 1440), "day");
}
