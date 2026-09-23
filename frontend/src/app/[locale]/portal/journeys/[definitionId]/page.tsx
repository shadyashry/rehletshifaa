import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n";

/** Compatibility: journeys moved into the Control Center. */
export default async function LegacyJourneyVersionsPage({ params }: { params: Promise<{ locale: string; definitionId: string }> }) {
  const { locale, definitionId } = await params;
  if (!isLocale(locale)) notFound();
  redirect(`/${locale}/portal/control-center/journeys/${definitionId}`);
}
