import { z } from "zod";

export const allowedFileTypes = ["application/pdf", "image/jpeg", "image/png"];
export const maxFileBytes = 15 * 1024 * 1024;

/** Letters in any script (Arabic included), combining marks, spaces and the punctuation real names use. */
const NAME_PART = /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u;

export const RELATIONSHIPS = ["PARENT", "CHILD", "SPOUSE", "SIBLING", "RELATIVE", "GUARDIAN", "OTHER"] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

/**
 * Send My Case: structured given/family names (never one "full name"); an explicit "who is this case for";
 * a representative's name + relationship when it is for someone else. Email stays optional here.
 */
export function buildCaseSchema(messages: { name: string; familyName?: string; required: string; phone: string; consent: string; email?: string; representative?: string }) {
  const name = (message: string) => z.string().trim().min(1, message).max(80, message).regex(NAME_PART, message);
  return z.object({
    caseFor: z.enum(["MYSELF", "SOMEONE_ELSE"]),
    givenName: name(messages.name),
    familyName: z.string().trim().max(80).regex(/^$|^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u, messages.familyName ?? messages.name),
    singleLegalName: z.boolean(),
    representativeName: z.string().trim().max(160),
    representativeRelationship: z.union([z.enum(RELATIONSHIPS), z.literal("")]),
    country: z.string().trim().min(2, messages.required).max(80),
    whatsappNumber: z.string().trim().regex(/^\+?[0-9][0-9\s()-]{6,24}$/, messages.phone),
    email: z.union([z.literal(""), z.string().trim().email(messages.email).max(254)]).optional(),
    conditionDescription: z.string().trim().max(2000).optional(),
    consent: z.literal(true, { error: messages.consent }),
  }).superRefine((value, ctx) => {
    // One-name patients are supported deliberately, not by inventing a surname.
    if (!value.familyName && !value.singleLegalName) ctx.addIssue({ code: "custom", path: ["familyName"], message: messages.familyName ?? messages.name });
    if (value.caseFor === "SOMEONE_ELSE") {
      if (!value.representativeName) ctx.addIssue({ code: "custom", path: ["representativeName"], message: messages.representative ?? messages.required });
      if (!value.representativeRelationship) ctx.addIssue({ code: "custom", path: ["representativeRelationship"], message: messages.representative ?? messages.required });
    }
  });
}

export function filesAreValid(files: File[]) {
  return files.length <= 10 && files.every(file => allowedFileTypes.includes(file.type) && file.size > 0 && file.size <= maxFileBytes);
}
