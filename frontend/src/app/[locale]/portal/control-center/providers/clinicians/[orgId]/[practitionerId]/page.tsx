import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { ClinicianPage, type ClinicianTab } from "@/components/platform-control-center/ClinicianPage";

// Kept here, not imported: values exported from a client module are client references on the server.
const TABS: ClinicianTab[] = ["overview", "setup", "credentials", "relationships", "prices", "schedule"];

export default async function ProviderClinicianPage({ params, searchParams }: { params: Promise<{ locale: string; orgId: string; practitionerId: string }>; searchParams: Promise<{ tab?: string; invited?: string }> }) {
  const { locale, orgId, practitionerId } = await params;
  const { tab, invited } = await searchParams;
  if (!isLocale(locale)) notFound();
  return <ClinicianPage locale={locale} organizationId={orgId} practitionerId={practitionerId} initialTab={TABS.find((t) => t === tab)} invited={invited === "1"} />;
}
