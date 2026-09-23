import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { JourneyList } from "@/components/platform-control-center/JourneyList";

export default async function JourneysPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <JourneyList locale={locale} />;
}
