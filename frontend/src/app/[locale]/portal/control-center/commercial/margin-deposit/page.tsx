import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { MarginDeposit } from "@/components/platform-control-center/MarginDeposit";

export default async function MarginDepositRoute({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <MarginDeposit locale={locale} />;
}
