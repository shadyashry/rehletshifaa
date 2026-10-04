import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CareCoordinationWorkspace } from "./CareCoordinationWorkspace";
import { apiFetchAs } from "@/lib/api";
import type { Me } from "@/lib/access";
import { fakeApi, json, meWith } from "./test-support";
import { automaticEntry, coordBase, coordConsultant, coordPeople, coordPolicy, coordTeam, manualEntry, queued, routingOverview, simulation } from "./coordination-test-support";

const auth = vi.hoisted(() => ({ user: { access_token: "test", profile: { sub: "coordination-manager" } }, me: null as Me | null, roles: [] as string[], loading: false, meFailed: false, refreshMe: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }));
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const READ = ["ROUTING_READ"];
const MANAGER = ["ROUTING_READ", "ROUTING_CONFIGURE", "ROUTING_ASSIGN"];
type Map = Record<string, unknown>;
const reads = (extra: Map = {}): Map => ({
  [`${coordBase}/overview`]: routingOverview, [`${coordBase}/teams`]: [coordTeam], [`${coordBase}/people`]: coordPeople,
  [`${coordBase}/consultants`]: [coordConsultant], [`${coordBase}/policies`]: [coordPolicy],
  [`${coordBase}/decisions?limit=50`]: [manualEntry, automaticEntry], [`${coordBase}/queue`]: [queued], ...extra,
});
const setup = (permissions: string[], extra: Map = {}) => { auth.me = meWith(permissions); vi.mocked(apiFetchAs).mockImplementation(fakeApi(reads(extra))); };
const body = (method: string, path: string) => JSON.parse(String(vi.mocked(apiFetchAs).mock.calls.find(([, p, init]) => p === path && (init?.method ?? "GET") === method)?.[2]?.body));

afterEach(() => { cleanup(); vi.clearAllMocks(); auth.me = null; });

describe("Coordination Setup — platform-wide routing configuration", () => {
  it("opens every section to a reader, states that routing is in effect, and offers no edits without ROUTING_CONFIGURE", async () => {
    setup(READ);
    render(<CareCoordinationWorkspace locale="en" />);
    expect(await screen.findByRole("tab", { name: "Teams & People" })).toHaveAttribute("aria-selected", "true");
    for (const name of ["Consultant Preferences", "Rules", "Advanced"]) expect(screen.getByRole("tab", { name })).toBeVisible();
    expect(await screen.findByText("Routing is in effect · 4 cases routed so far")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Edit routing profile" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set capacity" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Workforce › Teams" })).toHaveAttribute("href", "/en/portal/control-center/teams");
    expect(screen.getByRole("heading", { level: 1, name: "Coordination Setup" })).toBeVisible();
  });

  it("says when no rules are in effect, and denies anyone without ROUTING_READ", async () => {
    setup(READ, { [`${coordBase}/overview`]: { ...routingOverview, policyVersion: null } });
    render(<CareCoordinationWorkspace locale="en" />);
    expect(await screen.findByText("No routing rules are in effect")).toBeVisible();
    cleanup();
    auth.me = meWith(["JOURNEY_READ"]);
    render(<CareCoordinationWorkspace locale="en" />);
    expect(screen.getByText("You don't have access to Coordination Setup.")).toBeVisible();
    expect(apiFetchAs).toHaveBeenCalledTimes(3);
  });
});

describe("Teams & People", () => {
  it("shows workforce teams with their routing profile and members by name — never account identifiers", async () => {
    setup(MANAGER);
    const { container } = render(<CareCoordinationWorkspace locale="en" />);
    const team = (await screen.findByRole("heading", { name: "Cardiology Desk" })).closest("li")!;
    expect(within(team).getByText(/Sara Ahmed/)).toBeVisible();
    expect(within(team).getByText(/Team lead/)).toBeVisible();
    expect(screen.getByText("3 of 12 cases")).toBeVisible();
    expect(screen.getByText("Not currently a Coordinator")).toBeVisible();
    expect(container.textContent).not.toMatch(/kc-sara|kc-omar/);
  });

  it("edits a team's routing profile with a reason", async () => {
    setup(MANAGER, { [`PUT ${coordBase}/teams/team-1/profile`]: coordTeam });
    render(<CareCoordinationWorkspace locale="en" />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit routing profile" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Cardiology" }));
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Reason/ }), { target: { value: "All care areas" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await screen.findByText("Team saved.");
    expect(body("PUT", `${coordBase}/teams/team-1/profile`)).toEqual({ profile: { careAreas: [], languages: ["en"], fallbackTeam: null }, revision: 2, reason: "All care areas" });
  });

  it("sets capacity with care areas and languages as choices, not free text", async () => {
    setup(MANAGER, { [`PUT ${coordBase}/capacity`]: [] });
    render(<CareCoordinationWorkspace locale="en" />);
    fireEvent.click((await screen.findAllByRole("button", { name: "Set capacity" }))[0]);
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("spinbutton", { name: /Maximum active cases/ }), { target: { value: "8" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Cardiology" }));
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Reason/ }), { target: { value: "Part time" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await screen.findByText("Capacity saved.");
    expect(body("PUT", `${coordBase}/capacity`)).toMatchObject({ capacity: { subject: "kc-sara", maximum: 8, careAreas: ["cardiology"], revision: 1 }, reason: "Part time" });
  });
});

describe("Consultant Preferences and Rules", () => {
  it("shows each consultant's preference by name and changes it only with ROUTING_CONFIGURE", async () => {
    setup(MANAGER, { [`POST ${coordBase}/consultants/prac-1/preferences`]: coordConsultant.current });
    render(<CareCoordinationWorkspace locale="en" initialSection="preferences" />);
    const card = (await screen.findByRole("heading", { name: "Dr Salma Farouk" })).closest("li")!;
    expect(within(card).getByText("Sara Ahmed")).toBeVisible();
    fireEvent.click(within(card).getByRole("button", { name: "Change preference" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("combobox", { name: /Preferred team/ }), { target: { value: "team-1" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Reason/ }), { target: { value: "Cardiology focus" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await screen.findByText("Preference saved.");
    cleanup();
    setup(READ);
    render(<CareCoordinationWorkspace locale="en" initialSection="preferences" />);
    await screen.findByRole("heading", { name: "Dr Salma Farouk" });
    expect(screen.queryByRole("button", { name: "Change preference" })).not.toBeInTheDocument();
  });

  it("publishes a new rules version with normalized weights and no organization team", async () => {
    setup(MANAGER, { [`POST ${coordBase}/policies`]: coordPolicy });
    render(<CareCoordinationWorkspace locale="en" initialSection="rules" />);
    expect(await screen.findByText(/Version 2 · in effect/)).toBeVisible();
    expect(screen.queryByText("Organization team")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Publish new version" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("spinbutton", { name: /Spare capacity/ }), { target: { value: "70" } });
    expect(within(dialog).getByRole("button", { name: "Publish new version" })).toBeDisabled();
    fireEvent.change(within(dialog).getByRole("spinbutton", { name: /Language match/ }), { target: { value: "30" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Reason/ }), { target: { value: "Quarterly review" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Publish new version" }));
    await screen.findByText("New rules version published.");
    const sent = body("POST", `${coordBase}/policies`);
    expect(sent).toMatchObject({ expectedVersion: 2, reason: "Quarterly review", configuration: { capacityWeight: 70, languageWeight: 30, careAreaTeams: { cardiology: "team-1" } } });
    expect(sent.configuration).not.toHaveProperty("providerTeam");
  });
});

describe("Advanced — preview, history and the waiting queue", () => {
  it("previews a routing recommendation with backend reasons and no assignment side effect", async () => {
    setup(READ, { [`POST ${coordBase}/simulate`]: simulation });
    render(<CareCoordinationWorkspace locale="en" initialSection="advanced" />);
    const preview = (await screen.findByRole("heading", { name: "Preview routing recommendation" })).closest("section")!;
    fireEvent.change(within(preview).getByRole("combobox", { name: "Care area" }), { target: { value: "cardiology" } });
    fireEvent.click(within(preview).getByRole("button", { name: "Preview recommendation" }));
    expect(await within(preview).findByRole("heading", { name: /Recommended: Sara Ahmed/ })).toBeVisible();
    expect(within(preview).getByText(/From the care-area team/)).toBeVisible();
    expect(body("POST", `${coordBase}/simulate`)).toEqual({ consultantId: null, careArea: "cardiology", language: null, preferredCoordinator: null, preferredTeam: null });
  });

  it("lists routing decisions by case number, with who decided and why", async () => {
    setup(READ);
    render(<CareCoordinationWorkspace locale="en" initialSection="advanced" />);
    const history = (await screen.findByRole("heading", { name: "Routing decision history" })).closest("section")!;
    const [manual, automatic] = await within(history).findAllByRole("listitem");
    expect(manual).toHaveTextContent("Manual assignment · RS-2026-0042");
    expect(manual).toHaveTextContent("From: Sara Ahmed → To: Omar Nabil");
    expect(manual).toHaveTextContent("By Mohamed Ali");
    expect(manual).toHaveTextContent("Reason: Coverage change");
    expect(automatic).toHaveTextContent("Assigned by routing · RS-2026-0042");
    expect(history.textContent).not.toMatch(/Evaluation only|Recommendation recorded/);
  });

  it("assigns a waiting case only with ROUTING_ASSIGN, stating its consequences", async () => {
    setup(MANAGER, {
      [`${coordBase}/cases/case-9`]: { id: "case-9", consultantId: null, careArea: "cardiology", language: "en", owner: null, revision: 1, status: "READY_FOR_CONSULTANT" },
      [`${coordBase}/cases/case-9/history`]: [{ ...automaticEntry, selectedOwner: null, candidates: simulation.candidates }],
      [`POST ${coordBase}/cases/case-9/commands`]: json({}),
    });
    render(<CareCoordinationWorkspace locale="en" initialSection="advanced" />);
    fireEvent.click(await screen.findByRole("button", { name: "Assign coordinator" }));
    const dialog = await screen.findByRole("dialog", { name: /RS-2026-0099/ });
    expect(within(dialog).getByText(/becomes the case owner/)).toBeVisible();
    fireEvent.click(await within(dialog).findByRole("radio", { name: "Sara Ahmed" }));
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Reason/ }), { target: { value: "Nobody on duty" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Assign coordinator" }));
    await waitFor(() => expect(body("POST", `${coordBase}/cases/case-9/commands`)).toMatchObject({ revision: 1, action: "ASSIGN", target: "kc-sara", reason: "Nobody on duty" }));
    cleanup();
    setup(READ);
    render(<CareCoordinationWorkspace locale="en" initialSection="advanced" />);
    expect(await screen.findByText("RS-2026-0099")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Assign coordinator" })).not.toBeInTheDocument();
  });
});
