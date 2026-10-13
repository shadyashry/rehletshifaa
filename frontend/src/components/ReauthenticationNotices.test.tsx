import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { PortalReauthenticationNotice } from "./ReauthenticationNotices";

/** QA #6 / W-6: back from the re-check, the refused change is sent with one click — nothing is typed again. */
describe("PortalReauthenticationNotice", () => {
  afterEach(cleanup);
  const change = { path: "/doctor/cases/c1/review-decision", method: "POST", body: "{\"decision\":\"ACCEPT\"}" };

  it("offers to send the kept change, or to discard it", () => {
    const onResend = vi.fn(), onClose = vi.fn();
    render(<PortalReauthenticationNotice locale="en" pending={change} busy={false} onResend={onResend} onClose={onClose} className=""/>);
    expect(screen.getByRole("status").textContent).toContain("Your change has not been sent yet.");
    fireEvent.click(screen.getByRole("button", { name: "Send it now" }));
    expect(onResend).toHaveBeenCalledWith(change);
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("after an abandoned re-check claims no sign-in and offers nothing to send (QA W-30)", () => {
    render(<PortalReauthenticationNotice locale="en" pending={change} abandoned busy={false} onResend={vi.fn()} onClose={vi.fn()} className=""/>);
    expect(screen.getByRole("status").textContent).toContain("The security check was not completed. Nothing was changed.");
    expect(screen.queryByRole("button", { name: "Send it now" })).toBeNull();
  });

  it("without a kept change says to repeat it, in Arabic too", () => {
    render(<PortalReauthenticationNotice locale="ar" pending={null} busy={false} onResend={vi.fn()} onClose={vi.fn()} className=""/>);
    expect(screen.getByRole("status").textContent).toContain("يرجى إجراؤه مرة أخرى");
    expect(screen.queryByRole("button", { name: "أرسله الآن" })).toBeNull();
    expect(screen.getByRole("button", { name: "إغلاق" })).toBeTruthy();
  });
});
