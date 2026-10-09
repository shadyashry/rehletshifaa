import { afterEach, describe, expect, it } from "vitest";

import { formatCalendarDate } from "./dates";

describe("formatCalendarDate", () => {
  const zone = process.env.TZ;
  afterEach(() => { process.env.TZ = zone; });

  it("keeps a date of birth on its own day west of UTC", () => {
    process.env.TZ = "America/New_York";
    expect(formatCalendarDate("2000-01-01", "en")).toBe("January 1, 2000");
    expect(formatCalendarDate("2000-01-01", "ar")).toContain("2000");
    expect(formatCalendarDate("2000-01-01", "ar")).not.toContain("1999");
  });
});
