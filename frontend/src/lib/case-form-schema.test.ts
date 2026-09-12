import { describe, expect, it } from "vitest";
import { buildCaseSchema, filesAreValid, maxFileBytes } from "./case-form-schema";
const messages = { name: "name", familyName: "familyName", required: "required", phone: "phone", consent: "consent", representative: "representative" };
const base = { caseFor: "MYSELF" as const, givenName: "Jane", familyName: "Doe", singleLegalName: false, representativeName: "", representativeRelationship: "" as const, country: "Kenya", whatsappNumber: "+254700000000", conditionDescription: "", consent: true as const };
describe("case form validation", () => {
  it("accepts the minimal patient form with structured names", () => expect(buildCaseSchema(messages).safeParse(base).success).toBe(true));
  it("rejects a missing consent", () => expect(buildCaseSchema(messages).safeParse({ ...base, consent: false }).success).toBe(false));
  it("requires a family name unless the patient has a single legal name", () => {
    const schema = buildCaseSchema(messages);
    expect(schema.safeParse({ ...base, familyName: "" }).success).toBe(false);
    expect(schema.safeParse({ ...base, familyName: "", singleLegalName: true }).success).toBe(true);
  });
  it("accepts Arabic names", () => expect(buildCaseSchema(messages).safeParse({ ...base, givenName: "محمد عبد الله", familyName: "الأحمد" }).success).toBe(true));
  it("requires who is submitting when the case is for someone else", () => {
    const schema = buildCaseSchema(messages);
    const result = schema.safeParse({ ...base, caseFor: "SOMEONE_ELSE" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map(i => i.path[0])).toEqual(expect.arrayContaining(["representativeName", "representativeRelationship"]));
    expect(schema.safeParse({ ...base, caseFor: "SOMEONE_ELSE", representativeName: "Omar", representativeRelationship: "PARENT" }).success).toBe(true);
  });
  it("keeps email optional", () => expect(buildCaseSchema(messages).safeParse({ ...base, email: "" }).success).toBe(true));
  it("rejects unsupported and oversized files", () => { expect(filesAreValid([new File(["x"], "report.exe", { type: "application/octet-stream" })])).toBe(false); expect(filesAreValid([new File([new Uint8Array(maxFileBytes + 1)], "report.pdf", { type: "application/pdf" })])).toBe(false); });
});
