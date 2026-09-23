import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { JourneyDesigner } from "@/components/platform-control-center/JourneyDesigner";

const TABS = ["designer", "validation", "simulation", "diff", "publish"] as const;

export default async function JourneyDesignerPage({ params, searchParams }: { params: Promise<{ locale: string; definitionId: string; versionId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { locale, definitionId, versionId } = await params;
  const { tab } = await searchParams;
  if (!isLocale(locale)) notFound();
  const initialTab = (TABS as readonly string[]).includes(tab ?? "") ? (tab as typeof TABS[number]) : undefined;
  return <JourneyDesigner locale={locale} definitionId={definitionId} versionId={versionId} initialTab={initialTab} />;
}
