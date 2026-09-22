import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { AvailabilityManagement } from "@/components/platform-control-center/AvailabilityManagement";

export default async function ClinicianAvailabilityPage({ params }: { params: Promise<{ locale: string; id: string; practitionerId: string }> }) {
  const { locale, id, practitionerId } = await params;
  if (!isLocale(locale)) notFound();
  return <AvailabilityManagement locale={locale} organizationId={id} practitionerId={practitionerId} />;
}
