import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  typedRoutes: false,
  agentRules: false,
  async headers() {
    const api = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";
    const oidc = process.env.NEXT_PUBLIC_OIDC_AUTHORITY ?? "http://localhost:8180";
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Content-Security-Policy", value: `default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self' ${oidc}; img-src 'self' data:; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://www.googletagmanager.com; frame-src https://challenges.cloudflare.com; connect-src 'self' ${api} ${oidc} https://challenges.cloudflare.com https://www.google-analytics.com` },
      ],
    }];
  },
};

export default nextConfig;
