import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { PanelBoundary } from "./panel-parts";

function Broken(): never { throw new Error("unexpected view"); }

describe("PanelBoundary (UX 3-2)", () => {
  afterEach(cleanup);

  it("says in its own place that one panel could not be shown, and leaves its siblings drawn", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<div>
      <PanelBoundary title="Treatment" message="Treatment could not be shown."><Broken/></PanelBoundary>
      <p>Follow-up still here</p>
    </div>);
    expect(screen.getByRole("region", { name: "Treatment" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("Treatment could not be shown.");
    expect(screen.getByText("Follow-up still here")).toBeTruthy();
    quiet.mockRestore();
  });
});
