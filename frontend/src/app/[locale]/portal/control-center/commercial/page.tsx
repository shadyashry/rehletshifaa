import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n";

/** Commercial setup opens on Pricing. */
export default async function CommercialSetupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  redirect(`/${locale}/portal/control-center/commercial/pricing`);
}
