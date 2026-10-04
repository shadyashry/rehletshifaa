import { notFound } from "next/navigation";
import { PracticeManagerInvitation } from "@/components/virtual-clinic/PracticeManagerInvitation";
import { isLocale } from "@/lib/i18n";

export default async function PracticeManagerInvitationPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <PracticeManagerInvitation locale={locale} />;
}
