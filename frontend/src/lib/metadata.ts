import type { Metadata } from "next";
import type { Locale } from "./i18n";

export function pageMetadata(locale: Locale, path: string, title: string, description: string): Metadata {
  const cleanPath = path ? `/${path}` : "";
  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}${cleanPath}`,
      languages: { en: `/en${cleanPath}`, ar: `/ar${cleanPath}`, "x-default": `/en${cleanPath}` },
    },
    openGraph: { title, description, type: "website", locale: locale === "ar" ? "ar_EG" : "en_US", siteName: "RehletShifaa" },
    twitter: { card: "summary_large_image", title, description },
  };
}

