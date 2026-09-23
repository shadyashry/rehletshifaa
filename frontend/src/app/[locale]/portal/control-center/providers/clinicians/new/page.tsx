import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { AddClinician } from "@/components/platform-control-center/AddClinician";

export default async function AddClinicianPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ org?: string }> }) {
  const { locale } = await params;
  const { org } = await searchParams;
  if (!isLocale(locale)) notFound();
  return <AddClinician locale={locale} initialOrg={org} />;
}
