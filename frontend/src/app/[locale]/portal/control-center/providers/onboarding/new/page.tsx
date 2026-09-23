import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n";

/** Compatibility: Add consultant is now Providers › Clinicians › Add clinician. */
export default async function LegacyAddConsultantPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ org?: string }> }) {
  const { locale } = await params;
  const { org } = await searchParams;
  if (!isLocale(locale)) notFound();
  redirect(`/${locale}/portal/control-center/providers/clinicians/new${org ? `?org=${encodeURIComponent(org)}` : ""}`);
}
