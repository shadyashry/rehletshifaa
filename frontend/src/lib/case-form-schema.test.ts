import { describe, expect, it } from "vitest";
import { buildCaseSchema, filesAreValid, maxFileBytes } from "./case-form-schema";
const messages = { name: "name", required: "required", phone: "phone", consent: "consent" };
describe("case form validation", () => {
  it("accepts the minimal patient form", () => expect(buildCaseSchema(messages).safeParse({ fullName: "Jane Doe", country: "Kenya", whatsappNumber: "+254700000000", conditionDescription: "", consent: true }).success).toBe(true));
  it("rejects a missing consent", () => expect(buildCaseSchema(messages).safeParse({ fullName: "Jane Doe", country: "Kenya", whatsappNumber: "+254700000000", consent: false }).success).toBe(false));
  it("rejects unsupported and oversized files", () => { expect(filesAreValid([new File(["x"], "report.exe", { type: "application/octet-stream" })])).toBe(false); expect(filesAreValid([new File([new Uint8Array(maxFileBytes + 1)], "report.pdf", { type: "application/pdf" })])).toBe(false); });
});

