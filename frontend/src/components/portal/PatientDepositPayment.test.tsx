import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";

import { PatientDepositPayment } from "./PatientDepositPayment";
import { renderWithWork } from "./test-copy";

/**
 * DEP-3 (owner decision 2026-10-13): the patient pays the coordination deposit by bank transfer and enters the bank's
 * transaction reference — mandatory, the only proof asked for. Online payment is shown but cannot be chosen yet.
 */
const bank = { accountName: "RehletShifaa Test Account", bankName: "Test Bank (dummy details)", accountNumber: "0000000000000",
  iban: "EG000000000000000000000000000", swift: "TESTEGCXXXX", paymentReference: "RS-2026-000081" };

function renderPayment(overrides: Partial<Parameters<typeof PatientDepositPayment>[0]> = {}, locale: "en" | "ar" = "en") {
  const mutate = vi.fn(() => Promise.resolve({}));
  renderWithWork(<PatientDepositPayment locale={locale} caseId="c1" currency="USD" amountDue={500} totalDue={500} received={0}
                                        bank={bank} busy={false} mutate={mutate} {...overrides}/>, locale);
  return { mutate };
}

describe("PatientDepositPayment", () => {
  afterEach(cleanup);

  it("shows the amount with the preliminary-estimate caveat, online payment not yet available, and the account with the case as reference", () => {
    renderPayment();
    expect(screen.getByText("$500")).toBeTruthy();
    expect(screen.getByText(/may change after your doctor examines you in person/)).toBeTruthy();
    const online = screen.getByRole("radio", { name: /Online payment/ }) as HTMLInputElement;
    expect(online.disabled).toBe(true);
    expect(screen.getByText("Coming soon — not available yet.")).toBeTruthy();
    expect((screen.getByRole("radio", { name: /Bank transfer/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("EG000000000000000000000000000")).toBeTruthy();
    expect(screen.getByText("RS-2026-000081")).toBeTruthy();
    expect(screen.getByText(/Write this on your transfer/)).toBeTruthy();
  });

  it("asks for the transaction reference, says what it is for and where to find it, and sends only a valid one", () => {
    const { mutate } = renderPayment();
    const field = screen.getByRole("textbox", { name: /Transaction reference number/ });
    expect(field.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText(/so our finance team can find your payment and confirm it/)).toBeTruthy();
    expect(screen.getByText(/confirmation SMS or email, on the transfer receipt, or in your banking app/)).toBeTruthy();
    const submit = screen.getByRole("button", { name: "Send transfer reference" });
    // Mandatory: sending nothing explains the fix inline and puts the focus on the field; nothing is sent.
    fireEvent.click(submit);
    expect(screen.getByText(/letters and numbers, 4 to 64 characters/)).toBeTruthy();
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(field);
    fireEvent.change(field, { target: { value: "<x>" } });
    fireEvent.click(submit);
    expect(mutate).not.toHaveBeenCalled();

    fireEvent.change(field, { target: { value: "  FT 2026 1013  " } });
    expect(field.getAttribute("aria-invalid")).toBeNull();
    fireEvent.click(submit);
    expect(mutate).toHaveBeenCalledWith("/patient/cases/c1/deposit/transfer-reference", { reference: "FT 2026 1013" });
  });

  // P0-4 corridor rail: cash through an agent, proven by the agent's name and receipt number, verified by Finance.
  it("lets the patient pay cash through an agent and send the agent's name with the receipt number", () => {
    const { mutate } = renderPayment();
    fireEvent.click(screen.getByRole("radio", { name: /Cash through an agent/ }));
    // No bank account to copy; the payment reference to give the agent instead.
    expect(screen.queryByText("EG000000000000000000000000000")).toBeNull();
    expect(screen.getByText(/give the agent your payment reference/)).toBeTruthy();
    expect(screen.getByText("RS-2026-000081")).toBeTruthy();
    const submit = screen.getByRole("button", { name: "Send receipt number" });
    const receipt = screen.getByRole("textbox", { name: /Receipt number/ });
    fireEvent.change(receipt, { target: { value: "AG-7731" } });
    fireEvent.click(submit);
    // The agent is mandatory: nothing is sent and the focus goes to the agent field.
    const agent = screen.getByRole("textbox", { name: /Agent’s name and city/ });
    expect(screen.getByText("Enter the name of the agent you paid.")).toBeTruthy();
    expect(document.activeElement).toBe(agent);
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.change(agent, { target: { value: " Al Noor Exchange, Benghazi " } });
    fireEvent.click(submit);
    expect(mutate).toHaveBeenCalledWith("/patient/cases/c1/deposit/transfer-reference", { reference: "AG-7731", method: "AGENT_CASH", agentName: "Al Noor Exchange, Benghazi" });
  });

  it("offers the agent option in Arabic", () => {
    renderPayment({}, "ar");
    expect(screen.getByRole("radio", { name: /نقدًا عبر وكيل/ })).toBeTruthy();
  });

  it("shows the remaining amount after a part payment, and why the last reference was not confirmed", () => {
    renderPayment({ amountDue: 300, received: 200, transfer: { id: "t1", reference: "FT1", status: "REJECTED", submittedAt: "2026-10-13T09:00:00Z", reason: "No transfer with this reference" } });
    expect(screen.getByText("$300")).toBeTruthy();
    expect(screen.getByText("$200")).toBeTruthy();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("We couldn't confirm your last transfer.");
    expect(alert.textContent).toContain("No transfer with this reference");
  });

  it("reads in Arabic with the figures left-to-right", () => {
    renderPayment({}, "ar");
    expect(screen.getByRole("radio", { name: /الدفع الإلكتروني/ })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /الرقم المرجعي للعملية/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "إرسال الرقم المرجعي" })).toBeTruthy();
    const iban = screen.getByText("EG000000000000000000000000000");
    expect(iban.closest("[dir='ltr']")).toBe(iban);
  });
});
