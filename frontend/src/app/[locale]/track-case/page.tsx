import { notFound } from "next/navigation";

import { TrackCaseLanding } from "@/components/TrackCaseLanding";
import { isLocale } from "@/lib/i18n";

export default async function TrackCasePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <TrackCaseLanding locale={locale} />;
}
