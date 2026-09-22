import { redirect, notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";

export default async function ControlCenterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  redirect(`/${locale}/portal/control-center/providers`);
}
