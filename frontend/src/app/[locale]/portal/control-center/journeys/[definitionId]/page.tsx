import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { JourneyVersionWorkspace } from "@/components/platform-control-center/JourneyVersionWorkspace";

export default async function JourneyVersionsPage({ params }: { params: Promise<{ locale: string; definitionId: string }> }) {
  const { locale, definitionId } = await params;
  if (!isLocale(locale)) notFound();
  return <JourneyVersionWorkspace locale={locale} definitionId={definitionId} />;
}
