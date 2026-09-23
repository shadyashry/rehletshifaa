import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { DirectConsultantDetail, type DirectTab } from "@/components/platform-control-center/CareOperationsPages";

const TABS: DirectTab[] = ["overview", "approval", "pricing", "access"];

export default async function DirectConsultantPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ tab?: string; created?: string }> }) {
  const { locale, id } = await params;
  const { tab, created } = await searchParams;
  if (!isLocale(locale)) notFound();
  return <DirectConsultantDetail locale={locale} practitionerId={id} initialTab={TABS.find((t) => t === tab)} justCreated={created === "1"} />;
}
