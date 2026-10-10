// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const call = (locale: string, query = "") =>
  GET(new NextRequest(`http://localhost/${locale}/whatsapp${query}`), { params: Promise.resolve({ locale }) });

describe("/[locale]/whatsapp", () => {
  it("opens the business number with the first message in the page's language", async () => {
    const en = await call("en");
    expect(en.status).toBe(302);
    expect(en.headers.get("location")).toMatch(/^https:\/\/wa\.me\/\d+\?text=Hello%20RehletShifaa/);
    const ar = decodeURIComponent((await call("ar")).headers.get("location") ?? "");
    expect(ar).toContain("مرحبًا رحلة شفاء");
  });

  it("names the case only when the number looks like one", async () => {
    const withCase = decodeURIComponent((await call("en", "?case=RS-2026-000123")).headers.get("location") ?? "");
    expect(withCase).toContain("My case number is RS-2026-000123");
    const injected = decodeURIComponent((await call("en", "?case=please%20call%20me")).headers.get("location") ?? "");
    expect(injected).not.toContain("please call me");
  });
});
