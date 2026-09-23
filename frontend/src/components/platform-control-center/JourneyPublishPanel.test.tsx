import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { JourneyPublishPanel } from "./JourneyPublishPanel";
import type { JourneyVersion } from "./journey-types";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const published = { id: "v-1", definitionId: "def-1", number: 2, status: "PUBLISHED", revision: 4, simulationSummary: "COMPLETED" } as unknown as JourneyVersion;

describe("Journey publish panel", () => {
  it("retires a published version only after a consequence-aware confirmation", () => {
    const onRetire = vi.fn();
    render(<JourneyPublishPanel locale="en" version={published} materialChanges={null} can={[{ permission: "journey.retire", allowed: true }]} busy={false} reason="Superseded by v3"
      onSubmit={vi.fn()} onReturnToDraft={vi.fn()} onPublish={vi.fn()} onRetire={onRetire} />);
    fireEvent.click(screen.getByRole("button", { name: "Retire version…" }));
    expect(screen.getByText(/no longer be offered for new journeys/)).toBeVisible();
    expect(screen.getByText(/Cases already on this version stay on it/)).toBeVisible();
    expect(onRetire).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, retire version" }));
    expect(onRetire).toHaveBeenCalledTimes(1);
  });
});
