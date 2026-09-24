import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CareCoordinationWorkspace } from "./CareCoordinationWorkspace";
import { CareCoordinationOrganizations } from "./CareCoordinationOrganizations";
import { apiFetchAs } from "@/lib/api";
import { fakeApi, json } from "./test-support";
import { coordBase, coordConsultant, coordOrg, coordPeople, coordPolicy, coordTeam, evaluationOverview, liveEntry, shadowEntry, simulation } from "./coordination-test-support";

const auth = vi.hoisted(() => ({ user: { access_token: "test", profile: { sub: "coordination-manager" } }, roles: [] as string[], loading: false, signIn: vi.fn() }));
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/api", () => ({ apiFetchAs: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const VIEW = ["assignment.team.view", "assignment.policy.view", "assignment.simulate", "assignment.audit.view", "assignment.queue.manage"];
const MANAGE = ["assignment.team.manage", "assignment.preference.manage", "assignment.policy.manage", "assignment.manual_assign"];
type Map = Record<string, unknown>;
const reads = (extra: Map = {}): Map => ({
  "/admin/coordination/organizations": [coordOrg], [`${coordBase}/overview`]: evaluationOverview, [`${coordBase}/teams`]: [coordTeam],
  [`${coordBase}/people`]: coordPeople, [`${coordBase}/consultants`]: [coordConsultant], [`${coordBase}/policies`]: [coordPolicy],
  [`${coordBase}/decisions?limit=50`]: [liveEntry, shadowEntry], [`${coordBase}/queue`]: [], ...extra,
});
const setup = (capabilities: string[], extra: Map = {}) => vi.mocked(apiFetchAs).mockImplementation(fakeApi(reads(extra), capabilities));
const calls = () => vi.mocked(apiFetchAs).mock.calls.map(([, p, init]) => `${(init?.method ?? "GET").toUpperCase()} ${p}`);
const body = (method: string, path: string) => JSON.parse(String(vi.mocked(apiFetchAs).mock.calls.find(([, p, init]) => p === path && (init?.method ?? "GET") === method)?.[2]?.body));
const open = async (name: RegExp) => { fireEvent.click(await screen.findByRole("tab", { name })); };

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Coordination Setup — configuration, not a case queue", () => {
  it("shows only the sections the caller can open, business labels first, and states evaluation mode", async () => {
    setup(["assignment.team.view"]);
    render(<CareCoordinationWorkspace locale="en" orgId="org-1" />);
    expect(await screen.findByRole("tab", { name: "Teams & People" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: "Rules" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Advanced" })).not.toBeInTheDocument();
    expect(screen.getByText("Evaluation mode")).toBeVisible();
    expect(screen.getByText(/are measured but are not applied to live assignments/)).toBeVisible();
    // The title never turns into a loading message, and no engine vocabulary is primary content.
    expect(screen.getByRole("heading", { level: 1, name: "Coordination Setup" })).toBeVisible();
    expect(screen.queryByText(/shadow/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^(Assign|Reassign|Transfer)/ })).not.toBeInTheDocument();
  });

  it("says when cases use live routing and when no rules are in effect", async () => {
    setup(VIEW, { [`${coordBase}/overview`]: { ...evaluationOverview, liveCases: 2 } });
    render(<CareCoordinationWorkspace locale="en" orgId="org-1" />);
    expect(await screen.findByText("2 cases use live routing")).toBeVisible();
    cleanup();
    setup(VIEW, { [`${coordBase}/overview`]: { ...evaluationOverview, policyVersion: null } });
    render(<CareCoordinationWorkspace locale="en" orgId="org-1" />);
    expect(await screen.findByText("No routing rules are in effect")).toBeVisible();
  });

  it("loads the Teams & People page in five bounded reads — never one per person or team", async () => {
    setup(VIEW);
    render(<CareCoordinationWorkspace locale="en" orgId="org-1" />);
    await screen.findByText("Omar Nabil");
    expect(calls().filter((c) => c.startsWith("GET")).sort()).toEqual([
      "GET /admin/access/me", "GET /admin/access/me", "GET /admin/coordination/organizations",
      `GET ${coordBase}/overview`, `GET ${coordBase}/people`, `GET ${coordBase}/teams`,
    ].sort());
  });
});

describe("Teams & People", () => {
  it("shows people by name with team, caseload, duty and account state — never account identifiers", async () => {
    setup(VIEW);
    const { container } = render(<CareCoordinationWorkspace locale="en" orgId="org-1" />);
    const team = (await screen.findByRole("heading", { name: "Cardiology Desk" })).closest("li")!;
    expect(within(team).getByText(/Sara Ahmed/)).toBeVisible();
    expect(within(team).getByText(/Team lead/)).toBeVisible();
    expect(screen.getByText("3 of 12 cases")).toBeVisible();
    expect(screen.getByText("Disabled")).toBeVisible();
    expect(screen.getAllByText(/No capacity set/).length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/kc-sara|kc-omar|team-1/);
    // Read-only callers get no management actions.
    expect(screen.queryByRole("button", { name: "Add person" })).not.toBeInTheDocument();
  });

  it("adds only eligible coordinators, with the reason governance requires", async () => {
    setup([...VIEW, ...MANAGE]);
    render(<CareCoordinationWorkspace locale="en" orgId="org-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Add person" }));
    const dialog = screen.getByRole("dialog");
    // Omar can join; Sara is already in the team; a disabled account is never offered.
    expect(within(dialog).getByRole("radio", { name: /Omar Nabil/ })).toBeVisible();
    expect(within(dialog).queryByRole("radio", { name: /Sara Ahmed/ })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("radio", { name: /Hala Disabled/ })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("radio", { name: /Omar Nabil/ }));
    const add = within(dialog).getByRole("button", { name: "Add person" });
    expect(add).toBeDisabled();
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Reason for this change/ }), { target: { value: "New starter" } });
    fireEvent.click(add);
    await screen.findByText(/Added to the team/);
    expect(body("PUT", `${coordBase}/teams/team-1/members`)).toMatchObject({ member: { subject: "kc-omar", active: true, lead: false, revision: -1 }, reason: "New starter" });
  });

  it("explains what removal changes and keeps, then deactivates the membership", async () => {
    setup([...VIEW, ...MANAGE]);
    render(<CareCoordinationWorkspace locale="en" orgId="org-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove from team" }));
    const dialog = screen.getByRole("dialog", { name: "Remove Sara Ahmed from Cardiology Desk?" });
    expect(within(dialog).getByText(/Routing stops considering them for this team/)).toBeVisible();
    expect(within(dialog).getByText(/Cases they already own and their open work stay with them/)).toBeVisible();
    expect(within(dialog).getByText("Nobody is notified.")).toBeVisible();
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Reason/ }), { target: { value: "Moved desk" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove from team" }));
    await screen.findByText(/Removed from the team/);
    expect(body("PUT", `${coordBase}/teams/team-1/members`)).toMatchObject({ member: { subject: "kc-sara", active: false, revision: 4 }, reason: "Moved desk" });
  });

  it("sets capacity with care areas and languages as choices, not free text", async () => {
    setup([...VIEW, ...MANAGE]);
    render(<CareCoordinationWorkspace locale="en" orgId="org-1" />);
    fireEvent.click((await screen.findAllByRole("button", { name: "Set capacity" }))[0]);
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("spinbutton", { name: /Maximum active cases/ }), { target: { value: "8" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Cardiology" }));
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Reason/ }), { target: { value: "Part time" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await screen.findByText("Capacity saved.");
    expect(body("PUT", `${coordBase}/capacity`)).toMatchObject({ capacity: { subject: "kc-sara", maximum: 8, careAreas: ["cardiology"], languages: ["en", "ar"], revision: 1 }, reason: "Part time" });
  });
});

describe("Clinician Preferences and Rules", () => {
  it("shows each clinician's preference by name and schedules a finite, non-overlapping new version", async () => {
    setup([...VIEW, ...MANAGE]);
    render(<CareCoordinationWorkspace locale="en" orgId="org-1" />);
    await open(/Clinician Preferences/);
    const card = (await screen.findByRole("heading", { name: "Dr Salma Farouk" })).closest("li")!;
    expect(within(card).getByText("Sara Ahmed")).toBeVisible();
    expect(screen.getByText(/never guarantees the assignment/)).toBeVisible();
    fireEvent.click(within(card).getByRole("button", { name: "Change preference" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/The current version ends/)).toBeVisible();
    fireEvent.change(within(dialog).getByRole("combobox", { name: /Preferred team/ }), { target: { value: "team-1" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Reason/ }), { target: { value: "Cardiology focus" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await screen.findByText("Preference saved.");
    const sent = body("POST", `${coordBase}/consultants/prac-1/preferences`);
    expect(sent).toMatchObject({ expectedVersion: 1, coordinator: "kc-sara", team: "team-1", fallbackTeam: null, reason: "Cardiology focus" });
    expect(sent.from).toBe("2027-06-01T00:00:00Z");
    expect(new Date(sent.to).getTime()).toBeGreaterThan(new Date(sent.from).getTime());
  });

  it("explains the rules in business order with the configured teams, and publishes with a reason", async () => {
    setup([...VIEW, ...MANAGE]);
    render(<CareCoordinationWorkspace locale="en" orgId="org-1" />);
    await open(/^Rules$/);
    expect(await screen.findByText(/Version 2 · in effect/)).toBeVisible();
    expect(screen.getByText("Is on duty").closest("li")).toHaveTextContent("Required");
    expect(screen.getByText("Coordinates in the patient's language").closest("li")).toHaveTextContent("Not required");
    expect(screen.getByRole("heading", { name: "1. Keep the current coordinator" })).toBeVisible();
    expect(screen.getByText("Organization team").nextElementSibling).toHaveTextContent("Cardiology Desk");
    // Weights and the raw configuration are not primary content.
    expect(screen.queryByText(/"capacityWeight"/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Publish new version" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("spinbutton", { name: /Spare capacity/ }), { target: { value: "70" } });
    expect(within(dialog).getByRole("alert")).toHaveTextContent("must add up to 100");
    expect(within(dialog).getByRole("button", { name: "Publish new version" })).toBeDisabled();
    fireEvent.change(within(dialog).getByRole("spinbutton", { name: /Language match/ }), { target: { value: "30" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Reason/ }), { target: { value: "Quarterly review" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Publish new version" }));
    await screen.findByText("New rules version published.");
    expect(body("POST", `${coordBase}/policies`)).toMatchObject({ expectedVersion: 2, from: "2027-06-01T00:00:00Z", reason: "Quarterly review", configuration: { capacityWeight: 70, languageWeight: 30, providerTeam: "team-1", careAreaTeams: { cardiology: "team-1" } } });
  });
});

describe("Advanced — evaluation only", () => {
  it("previews a routing recommendation with backend reasons and no assignment side effect", async () => {
    setup([...VIEW, ...MANAGE], { [`POST ${coordBase}/simulate`]: simulation });
    render(<CareCoordinationWorkspace locale="en" orgId="org-1" initialSection="advanced" />);
    const preview = (await screen.findByRole("heading", { name: "Preview routing recommendation" })).closest("section")!;
    expect(within(preview).getAllByText("Evaluation only — this will not change the case owner or the person assigned to this work.")[0]).toBeVisible();
    fireEvent.change(within(preview).getByRole("combobox", { name: "Care area" }), { target: { value: "cardiology" } });
    fireEvent.click(within(preview).getByRole("button", { name: "Preview recommendation" }));
    expect(await within(preview).findByRole("heading", { name: /Recommended: Sara Ahmed/ })).toBeVisible();
    expect(within(preview).getByText(/From the organization team/)).toBeVisible();
    expect(within(preview).getAllByRole("listitem").map((li) => li.textContent)).toContain("Omar Nabil — Not in an active team for this care area · Off duty");
    expect(body("POST", `${coordBase}/simulate`)).toEqual({ consultantId: null, careArea: "cardiology", language: null, preferredCoordinator: null, preferredTeam: null });
    expect(calls().some((c) => c.includes("/commands"))).toBe(false);
    expect(within(preview).queryByRole("button", { name: /Assign|Reassign|Transfer/ })).not.toBeInTheDocument();
  });

  it("keeps recommendations visibly apart from decisions applied to a case", async () => {
    setup(VIEW);
    render(<CareCoordinationWorkspace locale="en" orgId="org-1" initialSection="advanced" />);
    const history = (await screen.findByRole("heading", { name: "Routing decision history" })).closest("section")!;
    const [applied, recommendation] = await within(history).findAllByRole("listitem");
    expect(applied).toHaveTextContent("Manual assignment · RS-2026-0042");
    expect(applied).toHaveTextContent("Applied to the case");
    expect(applied).toHaveTextContent("From: Omar Nabil → To: Sara Ahmed");
    expect(applied).toHaveTextContent("By Mohamed Ali");
    expect(applied).toHaveTextContent("Reason: Coverage change");
    expect(recommendation).toHaveTextContent("Recommendation recorded");
    expect(recommendation).toHaveTextContent("Evaluation only — nothing changed");
    expect(recommendation).toHaveTextContent("Differed from the current coordinator");
    // No live-routed case exists, so there is no live queue to show.
    expect(screen.queryByRole("heading", { name: /Live-routed cases/ })).not.toBeInTheDocument();
  });

  it("offers the authoritative assignment only for live-routed cases, with its consequences", async () => {
    setup([...VIEW, ...MANAGE], {
      [`${coordBase}/overview`]: { ...evaluationOverview, liveCases: 1, liveQueue: 1 },
      [`${coordBase}/queue`]: [{ caseId: "case-9", caseNumber: "RS-2026-0099", taskId: "task-9", team: "team-1", reason: "NO_ELIGIBLE_COORDINATOR", queuedAt: "2026-09-24T08:00:00Z", dueAt: "2026-09-25T08:00:00Z", revision: 3 }],
      [`${coordBase}/cases/case-9`]: { id: "case-9", organizationId: "org-1", consultantId: "prac-1", careArea: "cardiology", language: "en", owner: null, mode: "LIVE", revision: 3, status: "INTAKE_REVIEW" },
      [`${coordBase}/cases/case-9/history`]: [{ candidates: simulation.candidates }],
      [`POST ${coordBase}/cases/case-9/commands`]: json({}),
    });
    render(<CareCoordinationWorkspace locale="en" orgId="org-1" initialSection="advanced" />);
    fireEvent.click(await screen.findByRole("button", { name: "Assign coordinator" }));
    const dialog = await screen.findByRole("dialog", { name: /RS-2026-0099/ });
    expect(within(dialog).getByText(/becomes the case owner/)).toBeVisible();
    fireEvent.click(await within(dialog).findByRole("radio", { name: "Sara Ahmed" }));
    expect(within(dialog).queryByRole("radio", { name: "Omar Nabil" })).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Reason/ }), { target: { value: "Nobody on duty" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Assign coordinator" }));
    await waitFor(() => expect(body("POST", `${coordBase}/cases/case-9/commands`)).toMatchObject({ revision: 3, action: "ASSIGN", target: "kc-sara", reason: "Nobody on duty", source: "ADMIN_WEB" }));
  });

  it("renders Arabic right-to-left with names isolated", async () => {
    setup(VIEW);
    const { container } = render(<CareCoordinationWorkspace locale="ar" orgId="org-1" />);
    expect(await screen.findByRole("tab", { name: "الفرق والأشخاص" })).toBeVisible();
    expect(container.querySelector(".cc")).toHaveAttribute("dir", "rtl");
    expect(screen.getAllByText("Sara Ahmed").every((n) => n.closest("bdi"))).toBe(true);
  });
});

describe("Coordination organization picker", () => {
  it("opens the only organization directly — no picker hop", async () => {
    setup(VIEW);
    render(<CareCoordinationOrganizations locale="en" />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/en/portal/control-center/coordination/org-1"));
  });

  it("lists several organizations, and distinguishes an empty list from a denied one", async () => {
    setup(VIEW, { "/admin/coordination/organizations": [coordOrg, { ...coordOrg, id: "org-2", displayName: "Delta Hospital" }] });
    render(<CareCoordinationOrganizations locale="en" />);
    expect(await screen.findByRole("link", { name: /Delta Hospital/ })).toHaveAttribute("href", "/en/portal/control-center/coordination/org-2");
    expect(router.replace).not.toHaveBeenCalled();
    cleanup();
    setup(VIEW, { "/admin/coordination/organizations": [] });
    render(<CareCoordinationOrganizations locale="en" />);
    expect(await screen.findByText(/No organizations are set up for care coordination yet/)).toBeVisible();
    cleanup();
    vi.mocked(apiFetchAs).mockImplementation(async () => json({}, 403));
    render(<CareCoordinationOrganizations locale="en" />);
    expect(await screen.findByText(/You don't have access to Coordination Setup/)).toBeVisible();
  });
});
