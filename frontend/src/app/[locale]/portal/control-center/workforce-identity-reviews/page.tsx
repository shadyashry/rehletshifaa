import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n";
import { WorkforceIdentityReviewsPage } from "@/components/platform-control-center/WorkforceIdentityReviews";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <WorkforceIdentityReviewsPage locale={locale} />;
}
