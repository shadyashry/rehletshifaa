import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { StaffAndTeams } from "@/components/platform-control-center/CareOperationsPages";

export default async function StaffPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <StaffAndTeams locale={locale} />;
}
