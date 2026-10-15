import { notFound } from "next/navigation";

import { ProfileActivation } from "@/components/ProfileActivation";
import { getDictionary } from "@/lib/dictionary";
import { isLocale } from "@/lib/i18n";

export const metadata = { robots: { index: false, follow: false } };

export default async function ActivatePage({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  if (!isLocale(locale)) notFound();
  // P1-13: a guardian onboarding asks the guardian consent, in the words from the message files (placeholder pending counsel).
  return <ProfileActivation locale={locale} token={token} guardianConsent={getDictionary(locale).guardianConsent.text} />;
}
