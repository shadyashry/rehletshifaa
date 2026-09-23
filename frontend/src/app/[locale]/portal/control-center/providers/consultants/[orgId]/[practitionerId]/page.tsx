import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n";

/** Compatibility: the consultant workspace's tabs map onto the clinician page's sections. */
const TABS: Record<string, string> = { overview: "overview", credentials: "credentials", relationships: "relationships", pricing: "prices", availability: "schedule", readiness: "setup" };

export default async function LegacyConsultantPage({ params, searchParams }: { params: Promise<{ locale: string; orgId: string; practitionerId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { locale, orgId, practitionerId } = await params;
  const { tab } = await searchParams;
  if (!isLocale(locale)) notFound();
  const next = tab ? TABS[tab] : undefined;
  redirect(`/${locale}/portal/control-center/providers/clinicians/${orgId}/${practitionerId}${next ? `?tab=${next}` : ""}`);
}
