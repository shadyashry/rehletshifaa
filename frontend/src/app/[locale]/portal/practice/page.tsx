import { notFound } from "next/navigation";
import { ProviderWorkspace } from "@/components/provider-workspace/ProviderWorkspace";
import { isLocale } from "@/lib/i18n";

export default async function ProviderWorkspacePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <ProviderWorkspace locale={locale} />;
}
