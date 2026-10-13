import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SecondStepGate } from "./SecondStepGate";

describe("SecondStepGate", () => {
  afterEach(cleanup);

  it("offers a passkey role its authenticator app as the backup", () => {
    const onContinue = vi.fn();
    render(<SecondStepGate locale="en" acr="3" onContinue={onContinue} onSignOut={vi.fn()}/>);
    expect(screen.getByRole("heading", { level: 1, name: "Finish signing in" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenLastCalledWith("3");
    fireEvent.click(screen.getByRole("button", { name: "Use my authenticator app instead" }));
    expect(onContinue).toHaveBeenLastCalledWith("2");
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
