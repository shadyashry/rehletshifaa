import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { BRAND_THEME_BOOT, BrandThemeSwitch } from "./BrandThemeSwitch";

afterEach(() => { cleanup(); try { localStorage.clear(); } catch { /* jsdom storage */ } });
// The module keeps the last choice in memory across tests; each test starts by choosing explicitly or reading pressed state.

describe("BrandThemeSwitch — site-wide brand preview", () => {
  it("offers exactly the three candidates: Petrol & Paper, Lapis Sky and Lapis Night", () => {
    render(<BrandThemeSwitch locale="en" />);
    expect(screen.getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["Petrol & Paper", "Lapis Sky", "Lapis Night"]);
  });

  it("switches the whole document between Petrol & Paper and Lapis Sky and remembers the choice", () => {
    render(<BrandThemeSwitch locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Lapis Sky" }));
    expect(document.documentElement.dataset.brandTheme).toBe("lapis");
    expect(screen.getByRole("button", { name: "Lapis Sky" })).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("rs:brand-theme-preview")).toBe("lapis");
    fireEvent.click(screen.getByRole("button", { name: "Petrol & Paper" }));
    expect(document.documentElement.dataset.brandTheme).toBe("petrol");
    expect(localStorage.getItem("rs:brand-theme-preview")).toBe("petrol");
    fireEvent.click(screen.getByRole("button", { name: "Lapis Night" }));
    expect(document.documentElement.dataset.brandTheme).toBe("night");
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
    expect(boot("/en/care-areas", "petrol")).toBe("petrol");
    expect(boot("/en/care-areas", "night")).toBe("night");
    expect(boot("/en/care-areas", null)).toBe("petrol"); // Petrol & Paper is the public default
    // Retired candidates fall back to the default.
    for (const retired of ["original", "papyrus", "malachite", "serene"]) expect(boot("/en", retired)).toBe("petrol");
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
