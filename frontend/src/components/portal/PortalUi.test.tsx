import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { LockedSection, Status } from "./portal-ui";

describe("LockedSection", () => {
  afterEach(cleanup);

  it("takes locked controls out of reach for the keyboard and assistive technology, not only the mouse", () => {
    render(<LockedSection locked><button type="button">Release proposal</button></LockedSection>);
    const wrapper = screen.getByText("Release proposal").parentElement!;
    expect(wrapper.hasAttribute("inert")).toBe(true);
    expect(wrapper.className).not.toContain("pointer-events-none");
  });

  it("leaves the controls alone when unlocked", () => {
    render(<LockedSection locked={false}><button type="button">Release proposal</button></LockedSection>);
    expect(screen.getByText("Release proposal").parentElement!.hasAttribute("inert")).toBe(false);
  });
});

describe("Status", () => {
  afterEach(cleanup);

  it("shows a case status as a word on its status tone, with an icon so colour is never the only cue", () => {
    render(<Status value="INFORMATION_REQUIRED" locale="en"/>);
    const badge = document.querySelector(".status-badge")!;
    expect(badge.getAttribute("data-tone")).toBe("warning");
    expect(badge.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    expect(badge.textContent?.trim().length).toBeGreaterThan(0);
  });
});
