import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { HomeThemeSwitch } from "./HomeThemeSwitch";

afterEach(() => { cleanup(); try { localStorage.clear(); } catch { /* jsdom storage */ } });
// The module keeps the last choice in memory across tests; each test starts by choosing explicitly or reading pressed state.

describe("HomeThemeSwitch — brand preview on the home page only", () => {
  it("starts on the original theme and switches the whole document to Malachite & Gold", () => {
    render(<HomeThemeSwitch locale="en" />);
    expect(screen.getByRole("button", { name: /Original/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /Malachite & Gold/ }));
    expect(document.documentElement.dataset.brandTheme).toBe("malachite");
    expect(localStorage.getItem("rs:brand-theme-preview")).toBe("malachite");
    fireEvent.click(screen.getByRole("button", { name: /Original/ }));
    expect(document.documentElement.dataset.brandTheme).toBeUndefined();
  });

  it("offers the third candidate, Lapis Night, and remembers it", () => {
    render(<HomeThemeSwitch locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: /Lapis Night/ }));
    expect(document.documentElement.dataset.brandTheme).toBe("lapis");
    expect(screen.getByRole("button", { name: /Lapis Night/ })).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("rs:brand-theme-preview")).toBe("lapis");
  });

  it("restores the original theme when the home page unmounts, so no other page is affected", () => {
    const { unmount } = render(<HomeThemeSwitch locale="ar" />);
    fireEvent.click(screen.getByRole("button", { name: /الملكيت والذهبي/ }));
    expect(document.documentElement.dataset.brandTheme).toBe("malachite");
    unmount();
    expect(document.documentElement.dataset.brandTheme).toBeUndefined();
  });
});
