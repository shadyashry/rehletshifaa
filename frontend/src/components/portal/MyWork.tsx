"use client";

import { ArrowRight, CalendarClock, CheckCircle2, CircleAlert, Clock3, FileText } from "lucide-react";

import type { Locale } from "@/lib/i18n";

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
export function MyWork({ locale, items, busy, onOpen }: {
  locale: Locale; items: WorkItem[]; busy: boolean; onOpen: (caseId: string) => void;
}) {
  const ar = locale === "ar";
  const t = ar
    ? { title: "عملي", hint: "الإجراءات المسندة إليك مرتّبة حسب الأولوية.", empty: "لا يوجد عمل مفتوح لديك.",
        emptyHint: "سيظهر هنا كل إجراء يُسند إليك.", open: "فتح", due: "الاستحقاق", overdue: "متأخر", today: "اليوم",
        blocking: "يوقف التقدم", loading: "جارٍ التحميل…", waiting: "بانتظار", results: "عنصر عمل", reviewAssignment: "مراجعة التعيين",
        newAssignment: "تعيين جديد", care: "مجال الرعاية", coordinator: "المنسق", docs: "مستندات" }
    : { title: "My work", hint: "Actions assigned to you, most urgent first.", empty: "You have no open work.",
        emptyHint: "Anything assigned to you shows up here.", open: "Open", due: "Due", overdue: "Overdue", today: "today",
        blocking: "Blocking", loading: "Loading…", waiting: "Waiting on", results: "work items", reviewAssignment: "Review assignment",
        newAssignment: "New assignment", care: "Care area", coordinator: "Coordinator", docs: "documents" };

  return (
    <section aria-labelledby="my-work-title" aria-busy={busy} className="mb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="my-work-title" className="title">{t.title}</h2>
          <p className="mt-1 text-sm text-ink-500">{t.hint}</p>
        </div>
        <p role="status" className="text-sm text-ink-500">{busy ? t.loading : `${items.length} ${t.results}`}</p>
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
                    <PriorityChip priority={item.priority} locale={locale}/>
                    {item.overdue && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-alert-50 px-2.5 py-1 text-xs font-bold text-alert-800">
                        <CircleAlert size={13} aria-hidden/>{t.overdue}
                      </span>
                    )}
                    {item.blocking && (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900">{t.blocking}</span>
                    )}
                    <span className="text-xs font-semibold text-brand-700" dir="ltr">{item.caseNumber}</span>
                    {item.patientName && <span className="truncate text-xs font-semibold text-ink-700">{item.patientName}</span>}
                  </div>
                  <p className="mt-2 font-bold leading-6 text-ink-900">{item.title}</p>
                  {/* Enough case identity to act without opening it first. */}
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.78rem] text-ink-600">
                    {item.careCategory && <span>{t.care}: <strong className="font-semibold text-ink-800">{item.careCategory.replaceAll("-", " ")}</strong></span>}
                    {item.coordinatorName && <span>{t.coordinator}: <strong className="font-semibold text-ink-800">{item.coordinatorName}</strong></span>}
                    {!!item.documentCount && <span className="inline-flex items-center gap-1"><FileText size={12} aria-hidden/>{item.documentCount} {t.docs}</span>}
                  </p>
                  {item.context && <p className="mt-1 line-clamp-2 text-sm leading-6 text-ink-600">{item.context}</p>}
                  <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
                    <span className="inline-flex items-center gap-1"><Clock3 size={13} aria-hidden/>{age(item.createdAt, locale)}</span>
                    {item.dueAt && (
                      <span className={`inline-flex items-center gap-1 ${item.overdue ? "font-semibold text-alert-700" : ""}`}>
                        <CalendarClock size={13} aria-hidden/>{t.due} {new Date(item.dueAt).toLocaleDateString(locale)}
                      </span>
                    )}
                    {item.waitingOn && item.waitingOn !== "NONE" && <span>{t.waiting}: {waitingLabel(item.waitingOn, locale)}</span>}
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

function PriorityChip({ priority, locale }: { priority: string; locale: Locale }) {
  const ar = locale === "ar";
  const labels: Record<string, { en: string; ar: string; tone: string }> = {
    URGENT: { en: "Urgent", ar: "عاجل", tone: "bg-alert-50 text-alert-800" },
    HIGH: { en: "High", ar: "مرتفع", tone: "bg-amber-50 text-amber-900" },
    NORMAL: { en: "Normal", ar: "عادي", tone: "bg-brand-50 text-brand-800" },
    LOW: { en: "Low", ar: "منخفض", tone: "bg-stone-100 text-ink-600" },
  };
  const chip = labels[priority] ?? labels.NORMAL;
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${chip.tone}`}>{ar ? chip.ar : chip.en}</span>;
}

/**
 * Human phrasing for who owes the next move — never the raw enum. When the signed-in person is the one
 * being waited on, say so directly: a consultant should read "waiting on you", not "the consultant".
 */
export function waitingLabel(value: string, locale: Locale, viewerRole?: string) {
  const mine = viewerRole && (
    (value === "CONSULTANT" && viewerRole === "doctor") ||
    (value === "STAFF" && ["coordinator", "operations", "finance"].includes(viewerRole)));
  if (mine) return locale === "ar" ? "أنت" : "you";
  const map: Record<string, { en: string; ar: string }> = {
    STAFF: { en: "our team", ar: "فريقنا" },
    PATIENT: { en: "the patient", ar: "المريض" },
    CONSULTANT: { en: "the consultant", ar: "الاستشاري" },
    HOSPITAL: { en: "the hospital", ar: "المستشفى" },
    TRAVEL_TEAM: { en: "the travel team", ar: "فريق السفر" },
    PAYMENT: { en: "payment", ar: "الدفع" },
    EXTERNAL: { en: "an external party", ar: "جهة خارجية" },
    NONE: { en: "nobody", ar: "لا أحد" },
  };
  const entry = map[value] ?? map.STAFF;
  return locale === "ar" ? entry.ar : entry.en;
}

function age(iso: string, locale: Locale) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (minutes < 60) return format.format(-Math.max(minutes, 1), "minute");
  if (minutes < 1440) return format.format(-Math.floor(minutes / 60), "hour");
  return format.format(-Math.floor(minutes / 1440), "day");
}
