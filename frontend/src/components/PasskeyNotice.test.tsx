import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const auth = vi.hoisted(() => ({ signIn: vi.fn(async () => undefined), setUpPasskey: vi.fn(async () => undefined) }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));

import { PortalPasskeyNotice } from "./ReauthenticationNotices";

/** A2b: a privileged change that wants the passkey offers it — and its setup — instead of an endless re-check. */
describe("PortalPasskeyNotice", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); sessionStorage.clear(); });
  const change = { path: "/finance/cases/c1/deposits/d1/payments", method: "POST", body: "{\"amountEgp\":100}" };

  it("confirms with the passkey (keeping the change) or sets one up", async () => {
    render(<PortalPasskeyNotice locale="en" pending={change} className="" onClose={vi.fn()}/>);
    expect(screen.getByRole("alert").textContent).toContain("This action needs your passkey. Nothing was changed.");
    fireEvent.click(screen.getByRole("button", { name: "Confirm with my passkey" }));
    await vi.waitFor(() => expect(auth.signIn).toHaveBeenCalledWith(true));
    expect(sessionStorage.getItem("rs:reauthentication-pending-change")).toContain("/finance/cases/c1/deposits/d1/payments");
    fireEvent.click(screen.getByRole("button", { name: "Set up a passkey" }));
    expect(auth.setUpPasskey).toHaveBeenCalled();
  });

  it("speaks Arabic", () => {
    render(<PortalPasskeyNotice locale="ar" pending={null} className="" onClose={vi.fn()}/>);
    expect(screen.getByRole("button", { name: "إعداد مفتاح مرور" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "التأكيد بمفتاح المرور" })).toBeTruthy();
  });
});
