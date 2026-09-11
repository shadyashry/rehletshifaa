import "./globals.css";
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/api";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "RehletShifaa", template: "%s | RehletShifaa" },
  description: "Consultant-led international cardiac care coordination in Egypt.",
  verification: { google: process.env.NEXT_PUBLIC_SEARCH_CONSOLE_VERIFICATION },
  openGraph: { images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "RehletShifaa — Your Journey to Better Heart Care" }] },
  twitter: { images: ["/og.jpg"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
