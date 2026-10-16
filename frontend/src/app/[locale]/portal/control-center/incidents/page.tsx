import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionary";
import { isLocale } from "@/lib/i18n";
import { IncidentsPage } from "@/components/platform-control-center/IncidentsPage";

/** Reviews & Safety › Incidents (P1-13): Care Coordination Managers work incidents; Compliance reads them. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <IncidentsPage locale={locale} copy={getDictionary(locale).portalWork.safety.incidents} />;
}
