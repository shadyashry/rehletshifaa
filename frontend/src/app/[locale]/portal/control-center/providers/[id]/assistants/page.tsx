import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n";

/** Compatibility: people are now managed together on the organization's People tab. */
export default async function LegacyRolePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  redirect(`/${locale}/portal/control-center/providers/${id}?tab=people`);
}
