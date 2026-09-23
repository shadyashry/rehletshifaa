import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n";

/** Compatibility: the Consultants directory is now Providers › Clinicians (one list for both engagement models). */
export default async function LegacyConsultantsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ view?: string }> }) {
  const { locale } = await params;
  const { view } = await searchParams;
  if (!isLocale(locale)) notFound();
  redirect(`/${locale}/portal/control-center/providers/clinicians${view === "direct" ? "?engagement=direct" : ""}`);
}
