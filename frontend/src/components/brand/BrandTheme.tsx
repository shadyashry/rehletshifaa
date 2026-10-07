"use client";

import { useEffect } from "react";

/**
 * The site's brand is "Petrol & Paper" (`app/theme-petrol.css`, scoped to `data-brand-theme="petrol"`) on the public
 * site and patient portal. The Control Center keeps the bare base tokens, so the attribute is never set there.
 */
const CONTROL_CENTER = "\\/portal\\/control-center(\\/|$)";

/** Inline <head> script: applies the brand before first paint, never inside the Control Center. */
export const BRAND_THEME_BOOT = `(function(){if(!/${CONTROL_CENTER}/.test(location.pathname))document.documentElement.setAttribute("data-brand-theme","petrol")})()`;

/** Keeps the brand applied across client-side navigation; unmounting (entering the Control Center) removes it. */
export function BrandTheme() {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.brandTheme = "petrol";
    return () => { delete root.dataset.brandTheme; };
  }, []);
  return null;
}
