import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { OwnershipPage } from "@/components/platform-control-center/GovernancePages";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <OwnershipPage locale={locale} />;
}
