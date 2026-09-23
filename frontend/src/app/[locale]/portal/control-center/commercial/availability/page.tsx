import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { AvailabilityHub } from "@/components/platform-control-center/CommercialSetup";

export default async function AvailabilityPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ org?: string; clinician?: string }> }) {
  const { locale } = await params;
  const { org, clinician } = await searchParams;
  if (!isLocale(locale)) notFound();
  return <AvailabilityHub locale={locale} initialOrg={org} initialClinician={clinician} />;
}
