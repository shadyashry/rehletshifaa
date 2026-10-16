"use client";

import { ArrowRight, CalendarClock, CheckCheck, Clock3, FileText } from "lucide-react";

import { useWorkCopy } from "@/components/portal/portal-copy";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { intlLocale, type Locale } from "@/lib/i18n";
import { careAreaLabel, coordinatorLabel, plural, priorityLabel, waitingLabel, workCopyText, type WorkItemCopy } from "@/lib/portal-labels";

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
 * <p>Rows are a hairline list on one white sheet, with one quiet action each. Only an overdue or urgent first item earns the filled
 * button, so the page never shows a column of identical primaries. An empty list points to the next useful place.
 */
export function MyWork({ locale, role, subject, items, busy, onOpen, teamWaiting = 0, onTeamQueue }: {
  locale: Locale; role?: string; items: WorkItem[]; busy: boolean; onOpen: (caseId: string) => void;
  /** The viewer, so their own case reads "You" as it does in the queue. */
  subject?: string;
  /** New cases nobody owns yet (coordinators), offered as the next place to look when nothing is assigned. */
  teamWaiting?: number; onTeamQueue?: () => void;
}) {
  const work = useWorkCopy();
  const t = work.myWork;

  return (
    <section aria-labelledby="my-work-title" aria-busy={busy} className="mb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="my-work-title" className="title">{t.title}</h2>
          {/* Finance's queue also holds its team's pool (deposits to record), not only work assigned to them (QA W-44). */}
          <p className="mt-1 text-sm text-ink-500">{role === "finance" ? t.hintTeam : t.hint}</p>
        </div>
        <p role="status" className="text-sm font-semibold tabular-nums text-ink-500">{busy ? t.loading : items.length ? plural(work.locale, items.length, work.plural.workItems) : ""}</p>
      </div>

      {busy && items.length === 0 ? (
        <WorkSkeleton/>
      ) : items.length === 0 ? (
        <div className="mt-4 flex items-start gap-4 rounded-lg border border-line bg-white px-5 py-6 text-[0.9375rem]">
          <span aria-hidden className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
            <CheckCheck size={18}/>
          </span>
          <div className="min-w-0 pt-1.5">
            <p className="font-semibold text-brand-900">{t.empty}</p>
            {teamWaiting > 0 && onTeamQueue
              ? <button type="button" className="mt-1 inline-flex min-h-11 items-center gap-1.5 font-semibold text-brand-700 underline decoration-line-strong underline-offset-4 hover:decoration-current" onClick={onTeamQueue}>
                  {plural(work.locale, teamWaiting, work.plural.teamWaiting)}<ArrowRight size={16} className="rtl:rotate-180" aria-hidden/>
                </button>
              : <p className="mt-1 text-ink-600">{t.emptyHint}</p>}
          </div>
        </div>
      ) : (
        /* One sheet of the file on the paper desk: the petrol tab on its top edge marks the work that is yours now. */
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-lg border border-line-strong border-t-2 border-t-brand-600 bg-white">
          {items.map((item, index) => {
            const lead = index === 0 && (item.overdue || item.priority === "URGENT");
            const titleId = `work-item-${item.id}`;
            const text = worded(item, locale, work);
            const rail = item.overdue || item.priority === "URGENT" ? "bg-alert-600" : item.priority === "HIGH" ? "bg-status-warning-fg" : null;
            return (
            <li key={item.id} className="relative transition-colors hover:bg-brand-50/60">
              {/* Urgency also reads as a rail on the row's start edge; the badge keeps the word, so colour is never the only cue. */}
              {rail && <span aria-hidden className={`absolute inset-y-0 start-0 w-[3px] ${rail}`}/>}
              <article aria-labelledby={titleId} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-8 sm:px-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <span className="rounded border border-line bg-mist px-1.5 py-px text-[0.8125rem] font-semibold tabular-nums text-brand-700" dir="ltr">{item.caseNumber}</span>
                    {item.patientName && <bdi className="truncate text-[0.875rem] font-semibold text-ink-900">{item.patientName}</bdi>}
                    <PriorityChip priority={item.priority} label={priorityLabel(item.priority, work.priority)}/>
                    {item.overdue && <StatusBadge tone="danger">{t.overdue}</StatusBadge>}
                    {item.blocking && <StatusBadge tone="info">{t.blocking}</StatusBadge>}
                  </div>
                  {/* The backend titles work in English; Arabic shows the work type in Arabic, English keeps the specific title. */}
                  <h3 id={titleId} dir="auto" className="mt-2 text-[1.0625rem] font-semibold leading-6 text-brand-900">{text.title}</h3>
                  {text.context && <p dir="auto" className="mt-1 line-clamp-2 text-sm leading-6 text-ink-600">{text.context}</p>}
                  {/* Enough case identity to act without opening it first. */}
                  <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem] text-ink-500">
                    {item.careCategory && <span>{t.care}: <strong className="font-semibold text-ink-800">{careAreaLabel(item.careCategory, work.careAreas)}</strong></span>}
                    {(item.coordinatorSubject || item.coordinatorName) && <span>{t.coordinator}: <strong className="font-semibold text-ink-800"><bdi>{coordinatorLabel(item, subject, work.queue)}</bdi></strong></span>}
                    {item.waitingOn && item.waitingOn !== "NONE" && <span>{work.waiting.label}: <strong className="font-semibold text-ink-800">{waitingLabel(item.waitingOn, work.waiting, { role, holdsWork: true })}</strong></span>}
                    {!!item.documentCount && <span className="inline-flex items-center gap-1"><FileText size={13} aria-hidden/>{plural(work.locale, item.documentCount, work.plural.documents)}</span>}
                  </p>
                </div>
                {/* When it is due and how long it has waited sit with the action, so the eye goes date, then action. */}
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line pt-3 sm:flex-col sm:flex-nowrap sm:items-end sm:justify-center sm:gap-1.5 sm:border-t-0 sm:pt-0 sm:text-end">
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.8125rem] text-ink-500 sm:flex-col sm:items-end">
                    {item.dueAt && (
                      <span className={`inline-flex items-center gap-1 font-semibold ${item.overdue ? "text-alert-700" : "text-ink-800"}`}>
                        <CalendarClock size={14} aria-hidden/>{t.due}: {new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short" }).format(new Date(item.dueAt))}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1"><Clock3 size={13} aria-hidden/>{age(item.createdAt, locale)}</span>
                  </p>
                  <button type="button"
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
        </ul>
      )}
    </section>
  );
}

/** While the first load runs, the sheet's shape stands in for it, so the page does not jump when the work arrives. */
function WorkSkeleton() {
  return (
    <ul aria-hidden className="mt-4 divide-y divide-line overflow-hidden rounded-lg border border-line-strong border-t-2 border-t-brand-600 bg-white">
      {[0, 1, 2].map(row => (
        <li key={row} className="grid gap-3 px-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-8 sm:px-5">
          <div className="space-y-2.5 motion-safe:animate-pulse">
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

/** From the wording code when this page knows it; otherwise the backend's English, titled by type in Arabic. */
function worded(item: WorkItem, locale: Locale, work: ReturnType<typeof useWorkCopy>) {
  const known = workCopyText(item.copy, work.workCopy);
  if (known) return known;
  const localized = Object.hasOwn(work.workTitles, item.type) ? work.workTitles[item.type as keyof typeof work.workTitles] : undefined;
  return { title: (locale === "ar" ? localized : undefined) ?? (item.title || localized || ""), context: item.context };
}

function age(iso: string, locale: Locale) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  const format = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  if (minutes < 60) return format.format(-Math.max(minutes, 1), "minute");
  if (minutes < 1440) return format.format(-Math.floor(minutes / 60), "hour");
  return format.format(-Math.floor(minutes / 1440), "day");
}
