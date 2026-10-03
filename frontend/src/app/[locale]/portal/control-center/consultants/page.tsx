import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { ConsultantDirectory } from "@/components/platform-control-center/ConsultantDirectory";

export default async function ConsultantsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <ConsultantDirectory locale={locale} />;
}
