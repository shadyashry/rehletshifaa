import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { DirectClinicianPage, type DirectTab } from "@/components/platform-control-center/DirectClinicianPage";

const TABS: DirectTab[] = ["overview", "approval", "prices", "access"];

export default async function DirectClinicianRoute({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ tab?: string; invited?: string }> }) {
  const { locale, id } = await params;
  const { tab, invited } = await searchParams;
  if (!isLocale(locale)) notFound();
  return <DirectClinicianPage locale={locale} practitionerId={id} initialTab={TABS.find((t) => t === tab)} invited={invited === "1"} />;
}
