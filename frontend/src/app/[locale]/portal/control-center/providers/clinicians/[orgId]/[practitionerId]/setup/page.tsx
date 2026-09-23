import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n";

/** Consultant Setup is a section of the clinician's page. */
export default async function ClinicianSetupRedirect({ params }: { params: Promise<{ locale: string; orgId: string; practitionerId: string }> }) {
  const { locale, orgId, practitionerId } = await params;
  if (!isLocale(locale)) notFound();
  redirect(`/${locale}/portal/control-center/providers/clinicians/${orgId}/${practitionerId}?tab=setup`);
}
