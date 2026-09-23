import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n";

/** Compatibility: pricing now lives in the consultant's workspace. */
export default async function LegacyPricingPage({ params }: { params: Promise<{ locale: string; id: string; practitionerId: string }> }) {
  const { locale, id, practitionerId } = await params;
  if (!isLocale(locale)) notFound();
  redirect(`/${locale}/portal/control-center/providers/consultants/${id}/${practitionerId}?tab=pricing`);
}
