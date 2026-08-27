"use client";
import Script from "next/script";

export function AnalyticsScripts() {
  const gaId = process.env.NEXT_PUBLIC_GA4_ID;
  const adsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  const ids = [gaId, adsId].filter(Boolean) as string[];
  if (!ids.length) return null;
  const loaderId = gaId ?? adsId!;
  return <>
    <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(loaderId)}`} strategy="afterInteractive" />
    <Script id="rehletshifaa-analytics" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());${ids.map(id => `gtag('config','${id}',{anonymize_ip:true});`).join("")}`}</Script>
  </>;
}
