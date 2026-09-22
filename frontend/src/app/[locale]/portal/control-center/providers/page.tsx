import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { ProviderOrganizations } from "@/components/platform-control-center/ProviderOrganizations";

export default async function ProviderOrganizationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <ProviderOrganizations locale={locale} />;
}
