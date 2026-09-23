import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/i18n";

const TAB_TO_VIEW: Record<string, string> = { roles: "roles", permissions: "permissions", effective: "effective", audit: "audit" };

/** Compatibility: "Roles & Access" is now Control Center › Access & governance; `?tab=` deep links are preserved. */
export default async function LegacyAccessPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { locale } = await params;
  const { tab } = await searchParams;
  if (!isLocale(locale)) notFound();
  redirect(`/${locale}/portal/control-center/access/${TAB_TO_VIEW[tab ?? ""] ?? "roles"}`);
}
