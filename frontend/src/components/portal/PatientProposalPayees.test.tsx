import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { getDictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { PatientProposal, type PatientProposalData } from "./PatientProposal";

/** P1-19 (design §7.4): My Care shows the Consultant's and the hospital's lines and totals apart, never blended. */
const quote: PatientProposalData = {
  versionId: "v1", status: "RELEASED", currency: "USD", documentType: "FINAL_TREATMENT_QUOTE",
  items: [
    { id: "i1", category: "MEDICAL", description: "Consultant's fee", quantity: 1, unitPrice: 1600, optional: false, payee: "CONSULTANT" },
    { id: "i2", category: "MEDICAL", description: "Hospital stay and cath lab", quantity: 1, unitPrice: 400, optional: false, payee: "FACILITY" },
    { id: "i3", category: "PLATFORM_FEE", description: "Fee", quantity: 1, unitPrice: 100, optional: false, payee: "PLATFORM" },
  ],
  payeeTotals: [{ payee: "CONSULTANT", total: 1600 }, { payee: "FACILITY", total: 400 }, { payee: "PLATFORM", total: 100 }],
};
const show = (locale: Locale, proposal: PatientProposalData) => render(<PatientProposal locale={locale} copy={getDictionary(locale).portalProposal} proposal={proposal} />);

describe("PatientProposal payees", () => {
  afterEach(cleanup);

  it("names whose each line is and gives each payee's total", () => {
    show("en", quote);
    const payees = within(screen.getByRole("region", { name: "Who is paid" }));
    expect(payees.getByText("Paid to the Consultant").nextElementSibling).toHaveTextContent("$1,600");
    expect(payees.getByText("Paid to the hospital").nextElementSibling).toHaveTextContent("$400");
    expect(payees.getByText("RehletShifaa's fee").nextElementSibling).toHaveTextContent("$100");
    expect(screen.getAllByText("Paid to the hospital")).toHaveLength(2);
  });

  it("says nothing extra when the quote pays one party besides the fee", () => {
    show("en", { ...quote, items: [quote.items[0], quote.items[2]], payeeTotals: [{ payee: "CONSULTANT", total: 1600 }, { payee: "PLATFORM", total: 100 }] });
    expect(screen.queryByRole("region", { name: "Who is paid" })).toBeNull();
    expect(screen.queryByText("Paid to the Consultant")).toBeNull();
  });

  it("speaks Arabic", () => {
    show("ar", quote);
    expect(screen.getByRole("region", { name: "لمن يُدفع" })).toBeVisible();
    expect(screen.getAllByText("يُدفع للمستشفى")).toHaveLength(2);
  });
});
