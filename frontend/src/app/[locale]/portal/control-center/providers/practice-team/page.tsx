import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { PracticeTeam } from "@/components/platform-control-center/ProviderPeople";

export default async function PracticeTeamPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <PracticeTeam locale={locale} />;
}
