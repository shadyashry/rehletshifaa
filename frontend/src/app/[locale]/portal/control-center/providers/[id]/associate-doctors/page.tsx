import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { RoleManagement } from "@/components/platform-control-center/RoleManagement";

export default async function AssociateDoctorsPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  return <RoleManagement locale={locale} organizationId={id} role="ASSOCIATE_DOCTOR" />;
}
