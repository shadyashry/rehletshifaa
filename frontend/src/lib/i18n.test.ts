import { describe, expect, it } from "vitest";

import { intlLocale, latinDigits } from "./i18n";

describe("latinDigits", () => {
  it("turns Arabic-Indic and Persian digits into Latin ones and keeps everything else", () => {
    expect(latinDigits("٠٩١٢ ٣٤٥ ٦٧٨٩")).toBe("0912 345 6789");
    expect(latinDigits("+۲۴۹ (۹۱)")).toBe("+249 (91)");
    expect(latinDigits("RS-2026-000123")).toBe("RS-2026-000123");
  });
});

describe("intlLocale", () => {
  it("pins Latin digits for Arabic", () => {
    expect(new Intl.NumberFormat(intlLocale("ar")).format(4850)).toBe("4,850");
    expect(intlLocale("en")).toBe("en");
  });
});
