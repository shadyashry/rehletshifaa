import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { AccountSupportPage } from "@/components/platform-control-center/GovernancePages";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <AccountSupportPage locale={locale} />;
}
