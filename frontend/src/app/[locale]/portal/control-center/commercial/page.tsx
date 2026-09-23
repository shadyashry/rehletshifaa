import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n";

/** Commercial has no landing page of its own; it opens on Price Lists. */
export default async function CommercialPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  redirect(`/${locale}/portal/control-center/commercial/prices`);
}
