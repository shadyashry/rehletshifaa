import { notFound } from "next/navigation";
import { CommissioningAcceptance } from "@/components/owner/CommissioningAcceptance";
import { isLocale } from "@/lib/i18n";

export default async function CommissioningPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <CommissioningAcceptance locale={locale} />;
}
