import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { ClinicianDirectory } from "@/components/platform-control-center/ClinicianDirectory";

export default async function CliniciansPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ engagement?: string }> }) {
  const { locale } = await params;
  const { engagement } = await searchParams;
  if (!isLocale(locale)) notFound();
  return <ClinicianDirectory locale={locale} initialEngagement={engagement === "direct" || engagement === "provider" ? engagement : undefined} />;
}
