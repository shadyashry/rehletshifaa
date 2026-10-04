import { notFound } from "next/navigation";
import { OwnerWorkspace } from "@/components/owner/OwnerWorkspace";
import { isLocale } from "@/lib/i18n";

export default async function OwnerPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <OwnerWorkspace locale={locale} />;
}
