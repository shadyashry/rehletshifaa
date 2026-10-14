import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SecondStepGate } from "./SecondStepGate";

describe("SecondStepGate", () => {
  afterEach(cleanup);

  it("explains the passkey role's sign-in and offers one way forward", () => {
    const onContinue = vi.fn();
    render(<SecondStepGate locale="en" acr="3" onContinue={onContinue} onSignOut={vi.fn()}/>);
    expect(screen.getByRole("heading", { level: 1, name: "Finish signing in" })).toBeTruthy();
    expect(screen.getByText(/confirms sensitive actions with the passkey/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("asks for the app code in Arabic, with a way out", () => {
    const onSignOut = vi.fn();
    render(<SecondStepGate locale="ar" acr="2" onContinue={vi.fn()} onSignOut={onSignOut}/>);
    expect(screen.getByText(/الرمز من تطبيق المصادقة/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "استخدام تطبيق المصادقة بدلًا من ذلك" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "تسجيل الخروج" }));
    expect(onSignOut).toHaveBeenCalled();
  });
});
