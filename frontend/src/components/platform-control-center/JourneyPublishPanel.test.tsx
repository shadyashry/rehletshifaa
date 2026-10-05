import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { JourneyPublishPanel } from "./JourneyPublishPanel";
import type { JourneyVersion } from "./journey-types";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const v = (o: Partial<JourneyVersion>) => ({ id: "v-3", definitionId: "def-1", number: 3, status: "PENDING_APPROVAL", revision: 4, createdBy: "maker", simulationSummary: "COMPLETED", graph: { nodes: [], edges: [] }, graphHash: "h", validationSummary: null, publishedAt: null, retiredAt: null, runtimeDeployment: "NOT_DEPLOYED", ...o } as JourneyVersion);
const all = ["JOURNEY_EDIT", "JOURNEY_APPROVE"];
const renderPanel = (version: JourneyVersion, props: Partial<Parameters<typeof JourneyPublishPanel>[0]> = {}) => {
  const onDecide = vi.fn(async () => true); const onLoadIntake = vi.fn(); const onSubmit = vi.fn();
  render(<JourneyPublishPanel locale="en" version={version} journeyName="International Care Journey" versions={[v({ id: "v-1", number: 1, status: "PUBLISHED" }), version]} materialChanges={null}
    permissions={all} busy={false} reason="Adds the travel step" currentUser="checker" intake={{ productionIntakeEnabled: false }} onLoadIntake={onLoadIntake} onSubmit={onSubmit} onReturnToDraft={vi.fn()} onDecide={onDecide} {...props} />);
  return { onDecide, onLoadIntake, onSubmit };
};

describe("Approval & publishing", () => {
  it("shows the real lifecycle as steps: check, test, send for approval, independent publish", () => {
    renderPanel(v({ status: "SIMULATED" }));
    const steps = within(screen.getByRole("list", { name: "Approval & publishing" })).getAllByRole("listitem").map((li) => li.textContent);
    expect(steps).toEqual(["1. CheckPassed", "2. TestPassed", "3. Send for approvalNot yet", "4. Publish by an independent reviewerNot yet"]);
    expect(screen.getByRole("button", { name: "Send for approval" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
  });

  it("states maker/checker, and tells the version's creator someone else must publish", () => {
    renderPanel(v({}), { currentUser: "maker" });
    expect(screen.getByText(/must not have edited this version/)).toBeVisible();
    expect(screen.getByText("You created this version, so another authorized person must publish it.")).toBeVisible();
  });

  it("needs both publish and approve to offer publishing", () => {
    renderPanel(v({}), { permissions: ["JOURNEY_EDIT"] });
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(screen.getByText(/needs both the publish and approve permissions/)).toBeVisible();
  });

  it("confirms publishing with its consequences — production intake stays off and is not changed — and its own reason", async () => {
    const { onDecide, onLoadIntake } = renderPanel(v({}));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(onLoadIntake).toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Publish this journey version?" });
    expect(within(dialog).getByText(/Version 3 becomes a published version of International Care Journey/)).toBeVisible();
    expect(within(dialog).getByText(/Journey admission is off.*independently approved admission policy/)).toBeVisible();
    expect(within(dialog).getByText(/Cases already on an earlier version stay on it/)).toBeVisible();
    expect(within(dialog).getByText(/Saved in the journey history with this action/)).toBeVisible();
    const confirm = within(dialog).getByRole("button", { name: "Yes, publish version" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/Why are you publishing/), { target: { value: "Reviewed with operations" } });
    fireEvent.click(confirm);
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith("publish", "Reviewed with operations"));
  });

  it("retires a published version only after naming what replaces it for new cases", async () => {
    const { onDecide } = renderPanel(v({ status: "PUBLISHED", publishedAt: "2026-09-20T00:00:00Z" }));
    fireEvent.click(screen.getByRole("button", { name: "Retire version…" }));
    const dialog = screen.getByRole("dialog", { name: "Retire this published version?" });
    expect(within(dialog).getByText("Version 3 is no longer used for new patient cases.")).toBeVisible();
    expect(within(dialog).getByText(/Version 1 remains published.*admission policy selects it/)).toBeVisible();
    expect(within(dialog).getByText("Cases already on this version stay on it and are not moved.")).toBeVisible();
    expect(onDecide).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/Why are you retiring/), { target: { value: "Superseded" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Yes, retire version" }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith("retire", "Superseded"));
  });

  it("says when no published version would remain after retirement", () => {
    render(<JourneyPublishPanel locale="en" version={v({ status: "PUBLISHED" })} journeyName="J" versions={[v({ status: "PUBLISHED" })]} materialChanges={null} permissions={all} busy={false} reason=""
      intake={null} onLoadIntake={vi.fn()} onSubmit={vi.fn()} onReturnToDraft={vi.fn()} onDecide={vi.fn(async () => true)} />);
    fireEvent.click(screen.getByRole("button", { name: "Retire version…" }));
    expect(screen.getByText(/No published version would remain/)).toBeVisible();
  });
});
