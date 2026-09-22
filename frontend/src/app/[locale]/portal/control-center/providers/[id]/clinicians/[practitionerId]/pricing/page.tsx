import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { PricingManagement } from "@/components/platform-control-center/PricingManagement";

export default async function ClinicianPricingPage({ params }: { params: Promise<{ locale: string; id: string; practitionerId: string }> }) {
  const { locale, id, practitionerId } = await params;
  if (!isLocale(locale)) notFound();
  return <PricingManagement locale={locale} organizationId={id} practitionerId={practitionerId} />;
}
