import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { ConsultantDirectory } from "@/components/platform-control-center/ConsultantDirectory";

export default async function ConsultantsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ view?: string }> }) {
  const { locale } = await params;
  const { view } = await searchParams;
  if (!isLocale(locale)) notFound();
  return <ConsultantDirectory locale={locale} initialView={view === "direct" ? "direct" : undefined} />;
}
