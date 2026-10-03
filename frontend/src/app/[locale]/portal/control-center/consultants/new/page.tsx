import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { AddConsultant } from "@/components/platform-control-center/AddConsultant";

export default async function AddConsultantPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <AddConsultant locale={locale} />;
}
