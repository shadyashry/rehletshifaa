"use client";

import type { Locale } from "@/lib/i18n";
import type { AdminApi } from "./admin-api";
import { EmptyState, ErrorNotice, Facts, Section } from "./cc-ui";
import { useRead } from "./workforce-ui";

type ManagedCase = { caseId: string; caseReference: string; stage: string; coordinatorSubject: string; coordinatorName: string | null; openWork: number; overdueWork: number; blockingWork: number };

/** Only the server's operational projection is rendered; no case-detail links or action controls. */
export function ManagedCoordinationCases({ locale, api }: { locale: Locale; api: AdminApi }) {
  const ar = locale === "ar";
  const { data, error, reload } = useRead<ManagedCase[]>(api, "/admin/coordination/managed-cases");
  return <Section id="managed-coordination-cases" title={ar ? "ملخص الحالات المُدارة" : "Managed case summaries"}
    description={ar ? "العمل التشغيلي للفرق التي تديرها. لا تمنح الإدارة الوصول إلى المستندات الطبية أو الرسائل الخاصة، ولا تنفيذ عمل شخص آخر." : "Operational workload for teams you manage. Management does not grant access to medical documents or private messages, or let you execute another person's work."}>
    <ErrorNotice error={error} locale={locale} action="load" onRetry={reload} />
    {!data && !error ? <p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p> : data && (!data.length ? <EmptyState title={ar ? "لا توجد حالات ضمن نطاقك" : "No cases in your managed scope"} /> : <ul className="cc-cards">{data.map((item) => <li className="cc-card" key={item.caseId}>
      <h3>{item.caseReference}</h3>
      <Facts items={[
        [ar ? "المرحلة" : "Stage", item.stage],
        [ar ? "المنسق" : "Assigned coordinator", item.coordinatorName ?? (ar ? "اسم غير مسجّل" : "Name not recorded")],
        [ar ? "العمل المفتوح" : "Open work", item.openWork],
        [ar ? "العمل المتأخر" : "Overdue work", item.overdueWork],
        [ar ? "العوائق" : "Blockers", item.blockingWork],
      ]} />
    </li>)}</ul>)}
  </Section>;
}
