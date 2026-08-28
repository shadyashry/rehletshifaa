import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CategoryDetail } from "@/components/CategoryDetail";
import { getDictionary } from "@/lib/dictionary";
import { isLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const d = getDictionary(locale);
  return pageMetadata(locale, "orthopedics", d.orthopedics.title, d.orthopedics.intro);
}

export default async function Orthopedics({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const d = getDictionary(locale);
  return <CategoryDetail locale={locale} d={d} content={d.orthopedics} consultantSlug="hossam-kibba" />;
}
