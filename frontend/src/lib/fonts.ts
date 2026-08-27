import localFont from "next/font/local";

/**
 * Typography is self-hosted with `next/font/local`: the faces are emitted as
 * immutable, preloaded assets by the build, so there is no runtime request to a
 * third-party font CDN, no layout shift, and no extra npm dependency.
 *
 * Plus Jakarta Sans is the Latin voice (body + wordmark at weight 800); Cairo
 * carries Arabic. Latin runs inside Arabic copy (brand name, "TAVI/TAVR",
 * "ICD") fall through to the Latin face via the stack declared in globals.css.
 *
 * Licences: both families are SIL Open Font License 1.1.
 * See `src/assets/fonts/LICENSE-*.txt`.
 */
export const latinSans = localFont({
  variable: "--font-latin",
  display: "swap",
  adjustFontFallback: "Arial",
  fallback: ["Segoe UI", "system-ui", "-apple-system", "sans-serif"],
  src: [
    { path: "../assets/fonts/jakarta-latin-400.woff2", weight: "400", style: "normal" },
    { path: "../assets/fonts/jakarta-latin-500.woff2", weight: "500", style: "normal" },
    { path: "../assets/fonts/jakarta-latin-600.woff2", weight: "600", style: "normal" },
    { path: "../assets/fonts/jakarta-latin-700.woff2", weight: "700", style: "normal" },
    { path: "../assets/fonts/jakarta-latin-800.woff2", weight: "800", style: "normal" },
  ],
});

export const arabicSans = localFont({
  variable: "--font-arabic",
  display: "swap",
  adjustFontFallback: "Arial",
  fallback: ["Segoe UI", "Tahoma", "system-ui", "sans-serif"],
  src: [
    { path: "../assets/fonts/cairo-arabic-400.woff2", weight: "400", style: "normal" },
    { path: "../assets/fonts/cairo-arabic-500.woff2", weight: "500", style: "normal" },
    { path: "../assets/fonts/cairo-arabic-600.woff2", weight: "600", style: "normal" },
    { path: "../assets/fonts/cairo-arabic-700.woff2", weight: "700", style: "normal" },
    { path: "../assets/fonts/cairo-arabic-800.woff2", weight: "800", style: "normal" },
  ],
});

/** Both body faces load in every locale so mixed-script copy renders correctly. */
export const fontVariables = `${latinSans.variable} ${arabicSans.variable}`;
