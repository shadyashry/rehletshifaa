import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionary";
import { isLocale } from "@/lib/i18n";
import { RetentionPage } from "@/components/platform-control-center/RetentionPage";

/** Reviews & Safety › Retention (P1-7): policies and the purge log for Compliance and Care Coordination Managers; the manager erases a person on request. */
export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string; class?: string; case?: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const query = await searchParams;
  const work = getDictionary(locale).portalWork;
  return <RetentionPage locale={locale} copy={{ ...work.retention, days: work.plural.retentionDays }} query={{ tab: query.tab, class: query.class, case: query.case }} />;
}
