import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { ServiceAccountsPage } from "@/components/platform-control-center/GovernancePages";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <ServiceAccountsPage locale={locale} />;
}
