import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

import { CoordinatorActionForm } from "./CoordinatorActions";
import { CurrentActionPanel } from "./CurrentAction";
import { StaffNav, StaffViewLinks, type StaffViewItem } from "./StaffNav";
import { renderWithWork } from "./test-copy";

const items: StaffViewItem[] = [{ id: "work", label: "My work", count: 0 }, { id: "mine", label: "My cases" }, { id: "team", label: "Team queue", count: 2 }];

describe("staff navigation", () => {
  afterEach(() => { cleanup(); document.getElementById("portal-nav-slot")?.remove(); });

  it("is navigation with the current place marked, not a tablist", () => {
    const onSelect = vi.fn();
    renderWithWork(<StaffViewLinks locale="en" label="Your work" items={items} current="mine" clinic={{ href: "/en/portal/virtual-clinic", label: "Virtual Clinic" }} onSelect={onSelect} variant="inline"/>);
    const nav = screen.getByRole("navigation", { name: "Your work" });
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByRole("button", { name: "My cases" }).getAttribute("aria-current")).toBe("page");
    expect(nav.textContent).toContain("2");
    expect(screen.getByRole("link", { name: "Virtual Clinic" }).getAttribute("href")).toBe("/en/portal/virtual-clinic");
    fireEvent.click(screen.getByRole("button", { name: /Team queue/ }));
    expect(onSelect).toHaveBeenCalledWith("team");
  });

  it("renders into the site header slot", async () => {
    const slot = document.createElement("div");
    slot.id = "portal-nav-slot";
    document.body.appendChild(slot);
    renderWithWork(<StaffNav locale="ar" label="عملك" items={items} current="work" onSelect={vi.fn()}/>, "ar");
    await waitFor(() => expect(slot.querySelector("nav")).toBeTruthy());
    expect(slot.querySelector("[aria-current='page']")?.textContent).toContain("My work");
  });
});

describe("one entry point for assigning a Consultant", () => {
  afterEach(cleanup);
  const noneEligible = vi.fn(() => Promise.resolve([] as never));
  const form = (props: Partial<Parameters<typeof CoordinatorActionForm>[0]> = {}) => (
    <CoordinatorActionForm locale="en" code="ASSIGN_CONSULTANT" caseId="c1" version={1} careCategory="cardiology" categories={[]} staff={[]} busy={false} mutate={vi.fn()} load={noneEligible} {...props}/>
  );

  it("shows the form inside the current-action panel with no second button for the same job", async () => {
    const eligible = vi.fn(() => Promise.resolve([{ practitionerId: "p1", displayName: "Dr. Example", specialty: "Cardiology", capabilities: [], activeCases: 1, pendingOffers: 0, matchedBy: "CARE_AREA" }] as never));
    renderWithWork(<CurrentActionPanel locale="en" role="coordinator" action={{ code: "ASSIGN_CONSULTANT", kind: "FOCUS" }} onFocusAction={vi.fn()} form={form({ load: eligible })}/>);
    await screen.findByText("Dr. Example");
    expect(screen.getAllByRole("button", { name: /assign consultant/i })).toHaveLength(1);
    expect(screen.getByRole("group", { name: /assign a consultant/i })).toBeTruthy();
  });

  it("keeps the case's care area selected even when the category list lacks it", () => {
    renderWithWork(form());
    expect((screen.getByRole("combobox", { name: /case care area/i }) as HTMLSelectElement).value).toBe("cardiology");
  });

  it("tells a team with nobody to assign apart from a team list that could not be loaded", () => {
    renderWithWork(form({ code: "ASSIGN_OPERATIONS", staff: [] }));
    expect(screen.getByText(/No one on the Operations team can be assigned yet/)).toBeTruthy();
    cleanup();
    renderWithWork(form({ code: "ASSIGN_OPERATIONS", staff: null }));
    expect(screen.getByRole("alert").textContent).toMatch(/team list couldn't be loaded/);
    expect(screen.queryByText(/Ask the team's manager/)).toBeNull();
  });

  it("explains an unclassified case instead of a blank select", () => {
    renderWithWork(form({ careCategory: undefined }));
    expect(screen.getByRole("combobox", { name: /case care area/i }).getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText(/didn’t choose a care area/i)).toBeTruthy();
  });

  it("offers the next step when nobody is eligible", async () => {
    renderWithWork(form({ consultantsHref: "/en/portal/control-center/consultants" }));
    await screen.findByText(/no eligible consultant/i);
    // Nothing to submit, so no disabled submit either.
    expect(screen.queryByRole("button", { name: /assign consultant/i })).toBeNull();
    expect(screen.getByRole("button", { name: /choose another care area/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /see consultants for cardiology/i }).getAttribute("href")).toBe("/en/portal/control-center/consultants");
    cleanup();
    renderWithWork(form());
    await screen.findByText(/ask your coordinator lead/i);
  });
});
