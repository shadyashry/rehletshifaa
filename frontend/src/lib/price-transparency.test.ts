import { describe, expect, it } from "vitest";

import { finalQuoteState, refusalExplainedInPlace } from "./price-transparency";

describe("refusalExplainedInPlace", () => {
  it("is true only where a form or proposal note answers the code", () => {
    expect(refusalExplainedInPlace("COOLING_PERIOD", "/patient/cases/c1/proposals/v2/decision")).toBe(true);
    expect(refusalExplainedInPlace("FX_REAPPROVAL_REQUIRED", "/patient/cases/c1/proposals/v2/decision")).toBe(true);
    expect(refusalExplainedInPlace("SCOPE_CHANGE_REASON_REQUIRED", "/coordinator/cases/c1/final-quotes")).toBe(true);
    expect(refusalExplainedInPlace("QUOTE_VALIDITY_TOO_LONG", "/coordinator/cases/c1/final-quotes")).toBe(true);
  });

  it("leaves the banner to a decision the coordinator records on the patient's behalf, and to other codes", () => {
    expect(refusalExplainedInPlace("COOLING_PERIOD", "/coordinator/cases/c1/proposals/v2/decision")).toBe(false);
    expect(refusalExplainedInPlace("FX_REAPPROVAL_REQUIRED", "/coordinator/cases/c1/proposals/v2/record-decision")).toBe(false);
    expect(refusalExplainedInPlace("PROPOSAL_NOT_OPEN", "/patient/cases/c1/proposals/v2/decision")).toBe(false);
    expect(refusalExplainedInPlace("COOLING_PERIOD", "/patient/cases/c1/proposals/v2/decision/extra")).toBe(false);
  });
});

describe("finalQuoteState", () => {
  const now = Date.parse("2026-10-15T12:00:00Z");
  it("holds acceptance until the cooling period ends, then releases it", () => {
    expect(finalQuoteState({ acceptableFrom: "2026-10-16T00:00:00Z" }, now).acceptBlocked).toBe(true);
    expect(finalQuoteState({ acceptableFrom: "2026-10-15T11:00:00Z" }, now).acceptBlocked).toBe(false);
  });
  it("holds acceptance while Finance checks the rate, but not once it is confirmed", () => {
    expect(finalQuoteState({ fxReapprovalStatus: "PENDING" }, now).acceptBlocked).toBe(true);
    expect(finalQuoteState({ fxReapprovalStatus: "CONFIRMED" }, now).acceptBlocked).toBe(false);
  });
});
