import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { BRAND_THEME_BOOT, BrandTheme } from "./BrandTheme";

afterEach(() => { cleanup(); delete document.documentElement.dataset.brandTheme; });

describe("BrandTheme — Petrol & Paper", () => {
  it("boot script is valid JavaScript: applies Petrol & Paper, but never inside the Control Center", () => {
    const boot = (path: string) => {
      delete document.documentElement.dataset.brandTheme;
      new Function("location", BRAND_THEME_BOOT)({ pathname: path });
      return document.documentElement.dataset.brandTheme;
    };
    expect(boot("/en/care-areas")).toBe("petrol");
    expect(boot("/ar/portal")).toBe("petrol");
    expect(boot("/ar/portal/control-center/coordination")).toBeUndefined();
    expect(boot("/en/portal/control-center")).toBeUndefined();
  });

  it("applies the brand on mount and returns to the bare base tokens when it unmounts (entering the Control Center)", () => {
    const { unmount } = render(<BrandTheme />);
    expect(document.documentElement.dataset.brandTheme).toBe("petrol");
    unmount();
    expect(document.documentElement.dataset.brandTheme).toBeUndefined();
  });

  it("renders nothing visible", () => {
    const { container } = render(<BrandTheme />);
    expect(container.innerHTML).toBe("");
  });
});
