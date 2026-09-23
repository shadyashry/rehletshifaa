import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { HideInControlCenter, SiteMain, isControlCenterPath } from "./HideInControlCenter";

const nav = vi.hoisted(() => ({ pathname: "/en" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
afterEach(cleanup);

const page = () => render(<>
  <HideInControlCenter><header>Public site header</header></HideInControlCenter>
  <SiteMain><p>page</p></SiteMain>
  <HideInControlCenter><footer>Marketing footer</footer></HideInControlCenter>
</>);

describe("Control Center app shell vs. the public site chrome", () => {
  it("drops the public header and marketing footer inside the Control Center, and does not nest main landmarks", () => {
    nav.pathname = "/ar/portal/control-center/commercial/prices";
    page();
    expect(screen.queryByText("Marketing footer")).not.toBeInTheDocument();
    expect(screen.queryByText("Public site header")).not.toBeInTheDocument();
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });

  it("keeps them on public pages and in the care portal", () => {
    for (const path of ["/en", "/en/portal", "/en/portal/journeys"]) {
      nav.pathname = path;
      page();
      expect(screen.getByText("Marketing footer")).toBeVisible();
      expect(screen.getByRole("main")).toBeVisible();
      cleanup();
    }
  });

  it("matches only Control Center routes", () => {
    expect(isControlCenterPath("/en/portal/control-center")).toBe(true);
    expect(isControlCenterPath("/en/portal/control-center-old")).toBe(false);
    expect(isControlCenterPath(null)).toBe(false);
  });
});
