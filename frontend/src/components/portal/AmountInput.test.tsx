import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { AmountInput } from "./panel-parts";
import { renderWithWork } from "./test-copy";

afterEach(cleanup);

describe("AmountInput refusal", () => {
  it.each(["en", "ar"] as const)("says the refusal beside the field and clears it once the value fits (%s)", locale => {
    renderWithWork(<><label htmlFor="amt">Amount</label><AmountInput id="amt" name="amount" invalid="Enter an amount above zero." describedBy="amt-hint"/><p id="amt-hint">hint</p></>, locale);
    const field = screen.getByLabelText("Amount");
    expect(field.getAttribute("aria-invalid")).toBeNull();

    fireEvent.change(field, { target: { value: "0" } });
    fireEvent.blur(field);
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(field.getAttribute("aria-describedby")).toBe("amt-hint amt-error");
    expect(document.getElementById("amt-error")?.textContent).toBe("Enter an amount above zero.");

    fireEvent.change(field, { target: { value: "١٢٥" } });
    expect(field.getAttribute("aria-invalid")).toBeNull();
    expect(field.getAttribute("aria-describedby")).toBe("amt-hint");
    expect(document.getElementById("amt-error")).toBeNull();
  });

  it("shows the refusal when a submit is refused on an empty required field", () => {
    renderWithWork(<form><label htmlFor="amt">Amount</label><AmountInput id="amt" name="amount" invalid="Enter an amount."/></form>, "en");
    const field = screen.getByLabelText("Amount") as HTMLInputElement;
    let valid = true;
    act(() => { valid = field.checkValidity(); });
    expect(valid).toBe(false);
    expect(field.getAttribute("aria-invalid")).toBe("true");
  });
});
