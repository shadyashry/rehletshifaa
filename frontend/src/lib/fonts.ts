import localFont from "next/font/local";

/**
 * Typography is self-hosted with `next/font/local`: the faces are emitted as
 * immutable, preloaded assets by the build, so there is no runtime request to a
 * third-party font CDN, no layout shift, and no extra npm dependency.
 *
 * IBM Plex Sans and IBM Plex Sans Arabic are a matched superfamily, so the
 * English and Arabic experiences share one voice instead of two unrelated ones.
 * The Arabic face carries only the Arabic subset; Latin runs inside Arabic copy
 * (brand name, "TAVI/TAVR", "ICD") fall through to the Latin face via the font
 * stack declared in `globals.css`.
 *
 * Licences: IBM Plex and Source Serif 4 are both SIL Open Font License 1.1.
 * See `src/assets/fonts/LICENSE-*.txt`.
 */
export const latinSans = localFont({
  variable: "--font-latin",
  display: "swap",
  adjustFontFallback: "Arial",
  fallback: ["Segoe UI", "system-ui", "-apple-system", "sans-serif"],
  src: [
    { path: "../assets/fonts/plex-sans-latin-400.woff2", weight: "400", style: "normal" },
    { path: "../assets/fonts/plex-sans-latin-500.woff2", weight: "500", style: "normal" },
    { path: "../assets/fonts/plex-sans-latin-600.woff2", weight: "600", style: "normal" },
    { path: "../assets/fonts/plex-sans-latin-700.woff2", weight: "700", style: "normal" },
  ],
});

export const arabicSans = localFont({
  variable: "--font-arabic",
  display: "swap",
  adjustFontFallback: "Arial",
  fallback: ["Segoe UI", "Tahoma", "system-ui", "sans-serif"],
  src: [
    { path: "../assets/fonts/plex-sans-arabic-400.woff2", weight: "400", style: "normal" },
    { path: "../assets/fonts/plex-sans-arabic-500.woff2", weight: "500", style: "normal" },
    { path: "../assets/fonts/plex-sans-arabic-600.woff2", weight: "600", style: "normal" },
    { path: "../assets/fonts/plex-sans-arabic-700.woff2", weight: "700", style: "normal" },
  ],
});

/** Serif logotype only, matching the existing brand artwork in `public/og.jpg`. */
export const brandSerif = localFont({
  variable: "--font-brand-serif",
  display: "swap",
  fallback: ["Georgia", "Times New Roman", "serif"],
  src: [{ path: "../assets/fonts/source-serif-600.woff2", weight: "600", style: "normal" }],
});

/** Every locale loads both body faces so mixed-script copy renders correctly. */
export const fontVariables = `${latinSans.variable} ${arabicSans.variable} ${brandSerif.variable}`;
