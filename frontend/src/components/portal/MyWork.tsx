"use client";

import { ArrowRight, CalendarClock, CircleAlert, Clock3, FileText } from "lucide-react";

import { useWorkCopy } from "@/components/portal/portal-copy";
import type { Locale } from "@/lib/i18n";
import { careAreaLabel, plural, priorityLabel, waitingLabel, workCopyText, type WorkItemCopy } from "@/lib/portal-labels";

export type WorkItem = {
  id: string; caseId: string; caseNumber: string; patientName: string | null; caseStatus: string;
  waitingOn: string | null; careCategory?: string | null; coordinatorName?: string | null; documentCount?: number;
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
 * button, so the page never shows a column of identical primaries. An empty list points to the next useful place.
 */
export function MyWork({ locale, role, items, busy, onOpen, teamWaiting = 0, onTeamQueue }: {
  locale: Locale; role?: string; items: WorkItem[]; busy: boolean; onOpen: (caseId: string) => void;
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
          <p className="mt-1 text-sm text-ink-500">{t.hint}</p>
        </div>
        <p role="status" className="text-sm text-ink-500">{busy ? t.loading : items.length ? plural(locale, items.length, work.plural.workItems) : ""}</p>
      </div>

      {!busy && items.length === 0 ? (
        <div className="mt-4 border-t border-line pt-4 text-[0.9375rem]">
          <p className="font-semibold text-ink-900">{t.empty}</p>
          {teamWaiting > 0 && onTeamQueue
            ? <button type="button" className="mt-1 inline-flex min-h-11 items-center gap-1.5 font-semibold text-brand-700 underline decoration-line-strong underline-offset-4 hover:decoration-current" onClick={onTeamQueue}>
                {plural(locale, teamWaiting, work.plural.teamWaiting)}<ArrowRight size={16} className="rtl:rotate-180" aria-hidden/>
              </button>
            : <p className="mt-1 text-ink-600">{t.emptyHint}</p>}
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {items.map((item, index) => {
            const lead = index === 0 && (item.overdue || item.priority === "URGENT");
            const titleId = `work-item-${item.id}`;
            const text = worded(item, locale, work);
            return (
            <li key={item.id}>
              <article aria-labelledby={titleId} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-6">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <PriorityChip priority={item.priority} label={priorityLabel(item.priority, work.priority)}/>
                    {item.overdue && (
                      <span className="status-badge items-center gap-1 !border-alert-200 !bg-alert-50 !text-alert-800">
                        <CircleAlert size={13} aria-hidden/>{t.overdue}
                      </span>
                    )}
                    {item.blocking && <span className="status-badge">{t.blocking}</span>}
                    <span className="text-[0.8125rem] font-semibold text-brand-700" dir="ltr">{item.caseNumber}</span>
                    {item.patientName && <bdi className="truncate text-[0.8125rem] font-semibold text-ink-700">{item.patientName}</bdi>}
                  </div>
                  {/* The backend titles work in English; Arabic shows the work type in Arabic, English keeps the specific title. */}
                  <h3 id={titleId} dir="auto" className="mt-2 font-bold leading-6 text-ink-900">{text.title}</h3>
                  {/* Enough case identity to act without opening it first. */}
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-ink-600">
                    {item.careCategory && <span>{t.care}: <strong className="font-semibold text-ink-800">{careAreaLabel(item.careCategory, work.careAreas)}</strong></span>}
                    {item.coordinatorName && <span>{t.coordinator}: <strong className="font-semibold text-ink-800"><bdi>{item.coordinatorName}</bdi></strong></span>}
                    {!!item.documentCount && <span className="inline-flex items-center gap-1"><FileText size={12} aria-hidden/>{plural(locale, item.documentCount, work.plural.documents)}</span>}
                  </p>
                  {text.context && <p dir="auto" className="mt-1 line-clamp-2 text-sm leading-6 text-ink-600">{text.context}</p>}
                  <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem] text-ink-500">
                    <span className="inline-flex items-center gap-1"><Clock3 size={13} aria-hidden/>{age(item.createdAt, locale)}</span>
                    {item.dueAt && (
                      <span className={`inline-flex items-center gap-1 ${item.overdue ? "font-semibold text-alert-700" : ""}`}>
                        <CalendarClock size={13} aria-hidden/>{t.due}: {new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(item.dueAt))}
                      </span>
                    )}
                    {item.waitingOn && item.waitingOn !== "NONE" && <span>{work.waiting.label}: {waitingLabel(item.waitingOn, work.waiting, { role })}</span>}
                  </p>
                </div>
                <button type="button" aria-describedby={titleId}
                        className={lead ? "btn-primary w-full justify-center sm:w-auto" : "inline-flex min-h-11 items-center gap-1.5 self-start font-semibold text-brand-700 underline decoration-line-strong underline-offset-4 hover:decoration-current sm:self-center"}
                        onClick={() => onOpen(item.caseId)}>
                  {item.type==="CONSULTANT_ASSIGNMENT"?t.reviewAssignment:t.open}<ArrowRight size={16} className="rtl:rotate-180" aria-hidden/>
                </button>
              </article>
            </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * Words, not the enum: no uppercase styling, so "Normal" never reads as the raw value "NORMAL". Only a priority that
 * changes the order is marked — urgent in alert, high as the petrol badge, low as plain text — and Normal, the
 * default for most rows, carries no chip at all.
 */
function PriorityChip({ priority, label }: { priority: string; label: string }) {
  if (priority === "URGENT") return <span className="status-badge !border-alert-200 !bg-alert-50 !text-alert-800">{label}</span>;
  if (priority === "HIGH") return <span className="status-badge">{label}</span>;
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
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (minutes < 60) return format.format(-Math.max(minutes, 1), "minute");
  if (minutes < 1440) return format.format(-Math.floor(minutes / 60), "hour");
  return format.format(-Math.floor(minutes / 1440), "day");
}
