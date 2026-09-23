import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { ExchangeRatesPage } from "@/components/platform-control-center/CommercialSetup";

export default async function ExchangeRatesRoute({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <ExchangeRatesPage locale={locale} />;
}
