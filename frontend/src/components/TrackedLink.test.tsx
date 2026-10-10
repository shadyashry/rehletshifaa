import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { TrackedLink } from "./TrackedLink";

const analytics = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@/lib/analytics", () => analytics);
afterEach(cleanup);

describe("TrackedLink", () => {
  it("opens the WhatsApp entry in a new tab as a plain link, so Next never prefetches the off-site redirect", () => {
    render(<TrackedLink event="whatsapp_clicked" target="_blank" href="/en/whatsapp" className="btn-secondary">Talk to a coordinator</TrackedLink>);
    const link = screen.getByRole("link", { name: "Talk to a coordinator" });
    expect(link).toHaveAttribute("href", "/en/whatsapp");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveClass("btn-secondary");
    fireEvent.click(link);
    expect(analytics.track).toHaveBeenCalledWith("whatsapp_clicked");
  });

  it("keeps in-site links as client navigation", () => {
    render(<TrackedLink event="send_case_cta_clicked" href="/en/send-my-case">Send my case</TrackedLink>);
    const link = screen.getByRole("link", { name: "Send my case" });
    expect(link).toHaveAttribute("href", "/en/send-my-case");
    expect(link).not.toHaveAttribute("target");
  });
});
