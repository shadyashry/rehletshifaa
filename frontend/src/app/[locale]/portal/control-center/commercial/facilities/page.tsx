import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionary";
import { isLocale } from "@/lib/i18n";
import { FacilityCatalog } from "@/components/platform-control-center/FacilityCatalog";

export default async function FacilitiesRoute({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <FacilityCatalog locale={locale} suspensionCopy={getDictionary(locale).portalWork.compliance.suspension} />;
}
