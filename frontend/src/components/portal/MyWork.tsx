"use client";

import { ArrowRight, CalendarClock, CheckCircle2, CircleAlert, Clock3, FileText } from "lucide-react";

import { useWorkCopy } from "@/components/portal/portal-copy";
import type { Locale } from "@/lib/i18n";
import { careAreaLabel, plural, priorityLabel, waitingLabel } from "@/lib/portal-labels";

export type WorkItem = {
  id: string; caseId: string; caseNumber: string; patientName: string | null; caseStatus: string;
  waitingOn: string | null; careCategory?: string | null; coordinatorName?: string | null; documentCount?: number;
  type: string; title: string; context: string | null; priority: string;
  status: string; blocking: boolean; dueAt: string | null; overdue: boolean; createdAt: string; version: number;
};

/**
 * My Work — the primary operational view: every open action assigned to me, ordered by what matters first.
 *
 * <p>Each row is a real work item, independent of case status: it stays open until the work is done, and
 * reading the matching notification does not clear it.
 */
export function MyWork({ locale, role, items, busy, onOpen }: {
  locale: Locale; role?: string; items: WorkItem[]; busy: boolean; onOpen: (caseId: string) => void;
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
        <div className="card mt-4 px-6 py-12 text-center">
          <CheckCircle2 className="mx-auto mb-3 text-brand-600" size={28} aria-hidden/>
          <h3 className="font-bold text-ink-900">{t.empty}</h3>
          <p className="mt-2 text-sm text-ink-500">{t.emptyHint}</p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map(item => (
            <li key={item.id}>
              <article className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <PriorityChip priority={item.priority} label={priorityLabel(item.priority, work.priority)}/>
                    {item.overdue && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-alert-50 px-2.5 py-1 text-xs font-bold text-alert-800">
                        <CircleAlert size={13} aria-hidden/>{t.overdue}
                      </span>
                    )}
                    {item.blocking && (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900">{t.blocking}</span>
                    )}
                    <span className="text-xs font-semibold text-brand-700" dir="ltr">{item.caseNumber}</span>
                    {item.patientName && <bdi className="truncate text-xs font-semibold text-ink-700">{item.patientName}</bdi>}
                  </div>
                  {/* The backend titles work in English; Arabic shows the work type in Arabic, English keeps the specific title. */}
                  <p dir="auto" className="mt-2 font-bold leading-6 text-ink-900">{workTitle(item, locale, work.workTitles)}</p>
                  {/* Enough case identity to act without opening it first. */}
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.78rem] text-ink-600">
                    {item.careCategory && <span>{t.care}: <strong className="font-semibold text-ink-800">{careAreaLabel(item.careCategory, work.careAreas)}</strong></span>}
                    {item.coordinatorName && <span>{t.coordinator}: <strong className="font-semibold text-ink-800"><bdi>{item.coordinatorName}</bdi></strong></span>}
                    {!!item.documentCount && <span className="inline-flex items-center gap-1"><FileText size={12} aria-hidden/>{plural(locale, item.documentCount, work.plural.documents)}</span>}
                  </p>
                  {item.context && <p dir="auto" className="mt-1 line-clamp-2 text-sm leading-6 text-ink-600">{item.context}</p>}
                  <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
                    <span className="inline-flex items-center gap-1"><Clock3 size={13} aria-hidden/>{age(item.createdAt, locale)}</span>
                    {item.dueAt && (
                      <span className={`inline-flex items-center gap-1 ${item.overdue ? "font-semibold text-alert-700" : ""}`}>
                        <CalendarClock size={13} aria-hidden/>{t.due}: {new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(item.dueAt))}
                      </span>
                    )}
                    {item.waitingOn && item.waitingOn !== "NONE" && <span>{work.waiting.label}: {waitingLabel(item.waitingOn, work.waiting, { role })}</span>}
                  </p>
                </div>
                <button type="button" className="btn-primary w-full justify-center sm:w-auto" onClick={() => onOpen(item.caseId)}>
                  {item.type==="CONSULTANT_ASSIGNMENT"?t.reviewAssignment:t.open}<ArrowRight size={16} className="ms-1 rtl:rotate-180" aria-hidden/>
                </button>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const PRIORITY_TONES: Record<string, string> = {
  URGENT: "bg-alert-50 text-alert-800",
  HIGH: "bg-amber-50 text-amber-900",
  NORMAL: "bg-brand-50 text-brand-800",
  LOW: "bg-stone-100 text-ink-600",
};

/** Words, not the enum: no uppercase styling, so "Normal" never reads as the raw value "NORMAL". */
function PriorityChip({ priority, label }: { priority: string; label: string }) {
  const tone = Object.hasOwn(PRIORITY_TONES, priority) ? PRIORITY_TONES[priority] : "bg-stone-100 text-ink-600";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>{label}</span>;
}

function workTitle(item: WorkItem, locale: Locale, titles: Record<string, string>) {
  const localized = Object.hasOwn(titles, item.type) ? titles[item.type] : undefined;
  return (locale === "ar" ? localized : undefined) ?? (item.title || localized || "");
}

function age(iso: string, locale: Locale) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (minutes < 60) return format.format(-Math.max(minutes, 1), "minute");
  if (minutes < 1440) return format.format(-Math.floor(minutes / 60), "hour");
  return format.format(-Math.floor(minutes / 1440), "day");
}
