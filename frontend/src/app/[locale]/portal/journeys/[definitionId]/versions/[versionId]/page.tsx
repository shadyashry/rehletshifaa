import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n";

/** Compatibility: journeys moved into the Control Center; the tab deep link is preserved. */
export default async function LegacyJourneyDesignerPage({ params, searchParams }: { params: Promise<{ locale: string; definitionId: string; versionId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { locale, definitionId, versionId } = await params;
  const { tab } = await searchParams;
  if (!isLocale(locale)) notFound();
  redirect(`/${locale}/portal/control-center/journeys/${definitionId}/versions/${versionId}${tab ? `?tab=${encodeURIComponent(tab)}` : ""}`);
}
