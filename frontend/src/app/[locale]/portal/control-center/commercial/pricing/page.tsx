import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n";

/** Compatibility: "Pricing" is now Commercial › Price Lists; its exchange-rate view is Commercial › Exchange Rates. */
export default async function LegacyPricingPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ view?: string; org?: string; clinician?: string }> }) {
  const { locale } = await params;
  const { view, org, clinician } = await searchParams;
  if (!isLocale(locale)) notFound();
  if (view === "rates") redirect(`/${locale}/portal/control-center/commercial/exchange-rates`);
  const q = new URLSearchParams(Object.entries({ view, org, clinician }).filter((e): e is [string, string] => !!e[1]));
  redirect(`/${locale}/portal/control-center/commercial/prices${q.toString() ? `?${q}` : ""}`);
}
