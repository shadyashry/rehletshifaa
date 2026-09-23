import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { ConsultantWorkspace, type ConsultantTab } from "@/components/platform-control-center/ConsultantWorkspace";

// Kept here, not imported: values exported from a client module are client references on the server.
const TABS: ConsultantTab[] = ["overview", "credentials", "relationships", "pricing", "availability", "readiness"];

export default async function ConsultantWorkspacePage({ params, searchParams }: { params: Promise<{ locale: string; orgId: string; practitionerId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { locale, orgId, practitionerId } = await params;
  const { tab } = await searchParams;
  if (!isLocale(locale)) notFound();
  return <ConsultantWorkspace locale={locale} organizationId={orgId} practitionerId={practitionerId} initialTab={TABS.find((t) => t === tab)} />;
}
