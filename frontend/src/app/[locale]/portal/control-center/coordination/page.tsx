import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { CareCoordinationOrganizations } from "@/components/platform-control-center/CareCoordinationOrganizations";

export default async function CareCoordinationOrganizationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <CareCoordinationOrganizations locale={locale} />;
}
