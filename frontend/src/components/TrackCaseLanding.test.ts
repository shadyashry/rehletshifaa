import { describe, expect, it } from "vitest";

import { formatCaseId } from "./TrackCaseLanding";

describe("formatCaseId", () => {
  it("shapes typed and pasted input into RS-YYYY-NNNNNN", () => {
    expect(formatCaseId("rs 2026 000123")).toBe("RS-2026-000123");
    expect(formatCaseId("2026000123")).toBe("RS-2026-000123");
    expect(formatCaseId("RS-2026-000123")).toBe("RS-2026-000123");
    expect(formatCaseId("rs2026")).toBe("RS-2026");
  });

  it("lets the patient delete back through the prefix without re-adding dashes", () => {
    expect(formatCaseId("R")).toBe("R");
    expect(formatCaseId("RS")).toBe("RS");
    expect(formatCaseId("RS-")).toBe("RS");
    expect(formatCaseId("RS-2026-")).toBe("RS-2026");
    expect(formatCaseId("")).toBe("");
  });

  it("caps the sequence at six digits and drops stray characters", () => {
    expect(formatCaseId("RS-2026-0001234567")).toBe("RS-2026-000123");
    expect(formatCaseId("RS/2026.000123")).toBe("RS-2026-000123");
  });
});
