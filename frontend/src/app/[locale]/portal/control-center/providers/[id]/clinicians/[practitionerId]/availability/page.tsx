import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n";

/** Compatibility: the schedule now lives on the clinician page. */
export default async function LegacyAvailabilityPage({ params }: { params: Promise<{ locale: string; id: string; practitionerId: string }> }) {
  const { locale, id, practitionerId } = await params;
  if (!isLocale(locale)) notFound();
  redirect(`/${locale}/portal/control-center/providers/clinicians/${id}/${practitionerId}?tab=schedule`);
}
