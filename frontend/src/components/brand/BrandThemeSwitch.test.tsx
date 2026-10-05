import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { BRAND_THEME_BOOT, BrandThemeSwitch } from "./BrandThemeSwitch";

afterEach(() => { cleanup(); try { localStorage.clear(); } catch { /* jsdom storage */ } });
// The module keeps the last choice in memory across tests; each test starts by choosing explicitly or reading pressed state.

describe("BrandThemeSwitch — site-wide brand preview", () => {
  it("offers exactly the two candidates: Original and Lapis Night", () => {
    render(<BrandThemeSwitch locale="en" />);
    expect(screen.getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["Original", "Lapis Night"]);
  });

  it("switches the whole document between Original and Lapis Night and remembers the choice", () => {
    render(<BrandThemeSwitch locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Lapis Night" }));
    expect(document.documentElement.dataset.brandTheme).toBe("lapis");
    expect(screen.getByRole("button", { name: "Lapis Night" })).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("rs:brand-theme-preview")).toBe("lapis");
    fireEvent.click(screen.getByRole("button", { name: "Original" }));
    expect(document.documentElement.dataset.brandTheme).toBe("original");
  });

  it("boot script is valid JavaScript: applies the saved theme, but never inside the Control Center", () => {
    const boot = (path: string, saved: string | null = "lapis") => {
      delete document.documentElement.dataset.brandTheme;
      localStorage.clear();
      if (saved) localStorage.setItem("rs:brand-theme-preview", saved);
      new Function("location", BRAND_THEME_BOOT)({ pathname: path });
      return document.documentElement.dataset.brandTheme;
    };
    expect(boot("/en/care-areas")).toBe("lapis");
    expect(boot("/en/care-areas", null)).toBe("original"); // the polished Original is the public default
    expect(boot("/en", "malachite")).toBe("original"); // retired candidates fall back to Original
    expect(boot("/en", "serene")).toBe("original");
    expect(boot("/ar/portal/control-center/coordination")).toBeUndefined();
  });

  it("returns to the bare base tokens when it unmounts (entering the Control Center)", () => {
    const { unmount } = render(<BrandThemeSwitch locale="ar" />);
    fireEvent.click(screen.getByRole("button", { name: "سماء اللازورد" }));
    expect(document.documentElement.dataset.brandTheme).toBe("lapis");
    unmount();
    expect(document.documentElement.dataset.brandTheme).toBeUndefined();
  });
});
