import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n";

/** Access & governance opens on User access. */
export default async function AccessHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  redirect(`/${locale}/portal/control-center/access/users`);
}
