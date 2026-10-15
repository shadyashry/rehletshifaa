import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { OneTimeCodeStep, type OneTimeCodeCopy } from "./OneTimeCodeStep";
import { CaseJourney } from "./CaseJourney";
import { CaseStamp } from "./brand/CaseStamp";

const copy: OneTimeCodeCopy = {
  sendTo: "We will send a 6-digit code to", sentTo: "We sent a code to", send: "Send code", sending: "Sending…",
  codeLabel: "Enter the 6-digit code", verify: "Verify", verifying: "Verifying…", resend: "Resend code",
};

afterEach(cleanup);

describe("OneTimeCodeStep", () => {
  it("names where the code will go before it is sent, and offers no channel switch unless the link has one", () => {
    const onSend = vi.fn();
    render(<OneTimeCodeStep copy={copy} destination="•••• 7898" sent={false} busy={false} onSend={onSend} onVerify={vi.fn()}/>);
    expect(screen.getByText(/we will send a 6-digit code to/i).textContent).toContain("•••• 7898");
    expect(screen.queryByRole("button", { name: /instead/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(onSend).toHaveBeenCalledOnce();
  });

  it("asks for six digits in one labelled field without a placeholder, keeps a pasted code whole, and resends", () => {
    const onVerify = vi.fn(), onSend = vi.fn();
    render(<OneTimeCodeStep copy={copy} destination="•••• 7898" sent busy={false} onSend={onSend} onVerify={onVerify}/>);
    expect(screen.getByText(/we sent a code to/i)).toBeTruthy();
    const field = screen.getByLabelText("Enter the 6-digit code") as HTMLInputElement;
    expect(field.getAttribute("placeholder")).toBeNull();
    expect(field.getAttribute("aria-label")).toBeNull();
    // A pasted "123 456" keeps all six digits (no maxLength cutting it first).
    fireEvent.change(field, { target: { value: "123 456" } });
    expect(field.value).toBe("123456");
    expect(field.getAttribute("aria-describedby")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(onVerify).toHaveBeenCalledWith("123456");
    fireEvent.click(screen.getByRole("button", { name: "Resend code" }));
    expect(onSend).toHaveBeenCalledOnce();
    // The page remounts the step only after a successful send, so a failed resend keeps what was typed.
    expect(field.value).toBe("123456");
  });

  it("offers the other channel where the link accepts one, and ties an error to the field", () => {
    const onSwitch = vi.fn();
    render(<OneTimeCodeStep copy={copy} destination="•••• 7898" sent busy={false} onSend={vi.fn()} onVerify={vi.fn()}
                            channelSwitch={{ label: "Use email instead", onSwitch }} error="That code is not right."/>);
    fireEvent.click(screen.getByRole("button", { name: "Use email instead" }));
    expect(onSwitch).toHaveBeenCalledOnce();
    const field = screen.getByLabelText("Enter the 6-digit code");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(field.getAttribute("aria-describedby")?.split(" ").map(id => document.getElementById(id)?.textContent)).toEqual(["We sent a code to •••• 7898", "That code is not right."]);
    expect(screen.getByRole("alert").textContent).toBe("That code is not right.");
  });
});

describe("CaseJourney", () => {
  it("says each step's state in words and marks the patient's own step", () => {
    render(<CaseJourney id="j" title="Your case" steps={["One", "Two", "Three"]} current={1} completedLabel="completed" currentLabel="current" yoursLabel="Your step"/>);
    const items = screen.getAllByRole("listitem").map(li => li.textContent);
    expect(items).toEqual(["1One (completed)", "2Two (current), Your step", "3Three"]);
    expect(screen.getByRole("region", { name: "Your case" })).toBeTruthy();
  });

  it("marks nothing as reached or current for a case that ended", () => {
    render(<CaseJourney id="j" title="Your case" steps={["One", "Two"]} current={-1} completedLabel="completed" currentLabel="current"/>);
    expect(document.querySelector("[aria-current]")).toBeNull();
    expect(document.querySelectorAll('[data-state="upcoming"]').length).toBe(2);
  });
});

describe("CaseStamp", () => {
  it("prints the backend's date per locale, with the year only when it is not this year", () => {
    const thisYear = new Date().getFullYear();
    const { container, rerender } = render(<CaseStamp label="Received" date={`${thisYear}-03-04T10:00:00Z`} locale="en"/>);
    expect(container.textContent).toBe("ReceivedMar 4Received, Mar 4");
    rerender(<CaseStamp label="تم الاستلام" date="2024-03-04T10:00:00Z" locale="ar"/>);
    expect(container.textContent).toMatch(/^تم الاستلام4 .+ 2024تم الاستلام، 4 .+ 2024$/);
  });

  it("prints nothing when there is no date or it cannot be read", () => {
    const { container, rerender } = render(<CaseStamp label="Received" locale="en"/>);
    expect(container.textContent).toBe("");
    rerender(<CaseStamp label="Received" date="not a date" locale="en"/>);
    expect(container.textContent).toBe("");
  });
});
