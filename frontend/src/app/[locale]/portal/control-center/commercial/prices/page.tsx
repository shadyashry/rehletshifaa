import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { PricingHub } from "@/components/platform-control-center/CommercialSetup";

const VIEWS = ["consultants", "templates"] as const;

export default async function PriceListsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ view?: string }> }) {
  const { locale } = await params;
  const { view } = await searchParams;
  if (!isLocale(locale)) notFound();
  return <PricingHub locale={locale} initialView={VIEWS.find((v) => v === view)} />;
}
