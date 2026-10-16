import { notFound } from "next/navigation";
import { VirtualClinic } from "@/components/virtual-clinic/VirtualClinic";
import { getDictionary } from "@/lib/dictionary";
import { isLocale } from "@/lib/i18n";

export default async function VirtualClinicPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <VirtualClinic locale={locale} affiliationsCopy={getDictionary(locale).portalWork.affiliations} />;
}
