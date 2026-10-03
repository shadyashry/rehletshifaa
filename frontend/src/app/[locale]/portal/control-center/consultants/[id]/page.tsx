import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { ConsultantPage, type ConsultantTab } from "@/components/platform-control-center/ConsultantPage";

const TABS: ConsultantTab[] = ["overview", "approval", "prices", "access"];

export default async function ConsultantRoute({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ tab?: string; invited?: string }> }) {
  const { locale, id } = await params;
  const { tab, invited } = await searchParams;
  if (!isLocale(locale)) notFound();
  return <ConsultantPage locale={locale} practitionerId={id} initialTab={TABS.find((t) => t === tab)} invited={invited === "1"} />;
}
