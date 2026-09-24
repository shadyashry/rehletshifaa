"use client";

import { useEffect, useState } from "react";

import type { Locale } from "@/lib/i18n";

export type AssignmentHistoryEntry = {
  role: string; assigneeName: string | null; status: string; assignedAt: string; endedAt: string | null;
  assignedByKind: "PERSON" | "ROUTING" | "SYSTEM"; assignedByName: string | null; reason: string | null;
};

/**
 * Assignment history: who has been responsible for this case, newest first, ended assignments included. These are
 * authoritative records only (`case_assignments`). Routing recommendations are evaluation diagnostics and live in
 * Control Center › Coordination Setup › Advanced, never here.
 */
/** Render with `key={caseId}` so a different case starts from a fresh loading state. */
export function AssignmentHistory({ locale, caseId, load }: { locale: Locale; caseId: string; load: (caseId: string) => Promise<AssignmentHistoryEntry[]> }) {
  const ar = locale === "ar";
  const t = ar
    ? { title: "سجل التعيينات", loading: "جارٍ تحميل السجل…", failed: "تعذّر تحميل سجل التعيينات.", empty: "لا توجد تعيينات مسجلة على هذه الحالة بعد.", by: "بواسطة", routing: "التوجيه الآلي", system: "النظام", someone: "عضو في الفريق", reason: "السبب", current: "حالي", pending: "بانتظار القبول", declined: "مرفوض", ended: "انتهى", unknown: "اسم غير مسجّل" }
    : { title: "Assignment history", loading: "Loading history…", failed: "Assignment history could not be loaded.", empty: "No assignments are recorded on this case yet.", by: "By", routing: "automatic routing", system: "the system", someone: "a team member", reason: "Reason", current: "Current", pending: "Awaiting acceptance", declined: "Declined", ended: "Ended", unknown: "Name not recorded" };
  const roleLabel = (role: string) => ({
    COORDINATOR: ar ? "مالك الحالة (المنسق)" : "Case owner (coordinator)", DOCTOR: ar ? "الاستشاري" : "Consultant",
    OPERATIONS: ar ? "العمليات" : "Operations", FINANCE: ar ? "المالية" : "Finance",
  } as Record<string, string>)[role] ?? role;
  const [entries, setEntries] = useState<AssignmentHistoryEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    load(caseId).then((rows) => { if (live) setEntries(rows); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [caseId, load]);
  const when = (value: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  const status = (entry: AssignmentHistoryEntry) => entry.status === "ACTIVE" ? t.current : entry.status === "PENDING" ? t.pending : entry.status === "DECLINED" ? t.declined
    : `${t.ended}${entry.endedAt ? ` ${new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(entry.endedAt))}` : ""}`;
  const by = (entry: AssignmentHistoryEntry) => entry.assignedByKind === "ROUTING" ? t.routing : entry.assignedByKind === "SYSTEM" ? t.system : entry.assignedByName ? <bdi>{entry.assignedByName}</bdi> : t.someone;

  return <section className="card p-4" aria-labelledby="assignment-history-title">
    <h3 id="assignment-history-title" className="text-[0.7rem] font-bold uppercase tracking-[0.1em] text-ink-500">{t.title}</h3>
    {failed ? <p role="alert" className="mt-2 text-sm text-alert-700">{t.failed}</p>
      : entries === null ? <p role="status" className="mt-2 text-sm text-ink-500">{t.loading}</p>
      : !entries.length ? <p className="mt-2 text-sm text-ink-500">{t.empty}</p>
      : <ol className="mt-2">
        {entries.map((entry, index) => <li key={`${entry.assignedAt}-${index}`} className="border-b border-line py-2.5 text-[0.85rem] last:border-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-semibold text-ink-800">{roleLabel(entry.role)}: {entry.assigneeName ? <bdi>{entry.assigneeName}</bdi> : t.unknown}</span>
            <span className={`rounded-full px-2 py-0.5 text-[0.72rem] font-bold ${entry.status === "ACTIVE" ? "bg-brand-50 text-brand-800" : entry.status === "PENDING" ? "bg-amber-50 text-amber-900" : "bg-mist text-ink-600"}`}>{status(entry)}</span>
          </div>
          <p className="mt-0.5 text-[0.78rem] text-ink-500"><time dateTime={entry.assignedAt}>{when(entry.assignedAt)}</time> · {t.by} {by(entry)}</p>
          {entry.reason && <p className="mt-0.5 text-[0.78rem] text-ink-600">{t.reason}: {entry.reason}</p>}
        </li>)}
      </ol>}
  </section>;
}
