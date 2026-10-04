import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TrackCaseLanding } from "@/components/TrackCaseLanding";
import { isLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";

type Props = { params: Promise<{ locale: string }> };

const meta = {
  en: { title: "Track your case securely", description: "Get a fresh private tracking link sent to the WhatsApp number on your case." },
  ar: { title: "تابع حالتك بأمان", description: "احصل على رابط متابعة خاص وجديد يُرسل إلى رقم واتساب المسجّل في حالتك." },
} as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return pageMetadata(locale, "track-case", meta[locale].title, meta[locale].description);
}

export default async function TrackCasePage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <TrackCaseLanding locale={locale} />;
}
