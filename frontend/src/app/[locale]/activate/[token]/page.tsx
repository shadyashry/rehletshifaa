import { notFound } from "next/navigation";

import { ProfileActivation } from "@/components/ProfileActivation";
import { isLocale } from "@/lib/i18n";

export const metadata = { robots: { index: false, follow: false } };

export default async function ActivatePage({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  if (!isLocale(locale)) notFound();
  return <ProfileActivation locale={locale} token={token} />;
}
