import { z } from "zod";

export const allowedFileTypes = ["application/pdf", "image/jpeg", "image/png"];
export const maxFileBytes = 15 * 1024 * 1024;

export function buildCaseSchema(messages: { name: string; required: string; phone: string; consent: string }) {
  return z.object({
    fullName: z.string().trim().min(2, messages.name).max(120),
    country: z.string().trim().min(2, messages.required).max(80),
    whatsappNumber: z.string().trim().regex(/^\+?[0-9][0-9\s()-]{6,24}$/, messages.phone),
    conditionDescription: z.string().trim().max(2000).optional(),
    consent: z.literal(true, { error: messages.consent }),
  });
}

export function filesAreValid(files: File[]) {
  return files.length <= 10 && files.every(file => allowedFileTypes.includes(file.type) && file.size > 0 && file.size <= maxFileBytes);
}

