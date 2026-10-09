import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/** The finish plan's Close step: the re-critique P1s fixed in code (portal labels, secure links, Consultant pages). */
const pathname = vi.hoisted(() => ({ value: "/en" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

import { HideOnCaseForm } from "@/components/nav/HideOnCaseForm";
import { ConsultantCard } from "@/components/consultants/ConsultantCard";
import { statusLabel } from "@/components/portal/portal-model";
import { countryName } from "@/lib/countries";
import { getConsultants } from "@/lib/consultants";

describe("staff status words", () => {
  it("speak in the staff voice and never fall back to a raw value for proposal or work states", () => {
    expect(statusLabel("PATIENT_DECISION", "en")).toBe("Waiting for the patient's decision");
    expect(statusLabel("PATIENT_DECISION", "ar")).toBe("بانتظار قرار المريض");
    expect(statusLabel("RELEASED", "en")).toBe("Sent to the patient");
    expect(statusLabel("OPEN", "ar")).toBe("مفتوحة");
    expect(statusLabel("CONSULTANT_REVIEW", "en")).toBe("Under Consultant review");
  });
});

describe("countryName", () => {
  it("shows a stored code or English name as the reader's own word", () => {
    expect(countryName("KE", "en")).toBe("Kenya");
    expect(countryName("Kenya", "ar")).not.toMatch(/Kenya/);
    expect(countryName("Atlantis", "en")).toBe("Atlantis");
    expect(countryName(null, "en")).toBe("");
  });
});

describe("the header's Send my case", () => {
  afterEach(cleanup);
  it("steps aside on a patient's own secure links and the form, nowhere else", () => {
    for (const [path, shown] of [["/en", true], ["/en/send-my-case", false], ["/en/proposal/abc", false], ["/ar/status/abc", false], ["/en/how-it-works", true]] as const) {
      pathname.value = path;
      const locale = path.split("/")[1];
      render(<HideOnCaseForm locale={locale}><a href="#">Send my case</a></HideOnCaseForm>);
      expect(screen.queryByText("Send my case") !== null, path).toBe(shown);
      cleanup();
    }
  });
});

describe("Consultant pages", () => {
  afterEach(cleanup);
  it("carry no CV sourcing notes", () => {
    for (const locale of ["en", "ar"] as const)
      for (const profile of getConsultants(locale)) expect(`${profile.role} ${profile.distinction ?? ""}`).not.toMatch(/\bCV\)/);
  });

  it("do not repeat the role as a distinction", () => {
    const profile = { ...getConsultants("en")[0], role: "Professor of Cardiology, Ain Shams University", distinction: "Professor of Cardiology" };
    render(<ConsultantCard profile={profile} system="heart" icon="heart" href="/en/consultants/x" labels={{ view: "View", viewOf: "View profile", distinction: "Professional distinction", focus: "Focus" }} />);
    expect(screen.queryByText("Professional distinction")).toBeNull();
  });
});
