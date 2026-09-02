import { afterEach, describe, expect, it } from "vitest";
import { whatsappHref } from "./links";

const originalNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;

afterEach(() => {
  if (originalNumber === undefined) delete process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
  else process.env.NEXT_PUBLIC_WHATSAPP_NUMBER = originalNumber;
});

describe("whatsappHref", () => {
  it("uses the app WhatsApp number and encodes the message", () => {
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER = "+20 101 044 7898";
    expect(whatsappHref("Case RS-1")).toBe("https://wa.me/201010447898?text=Case%20RS-1");
  });

  it("falls back to the configured app number", () => {
    delete process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
    expect(whatsappHref()).toBe("https://wa.me/201010447898");
  });
});
