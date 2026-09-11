import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/api";
export default function robots(): MetadataRoute.Robots { const base = SITE_URL; return { rules: { userAgent: "*", allow: "/", disallow: ["/api/"] }, sitemap: `${base}/sitemap.xml` }; }

