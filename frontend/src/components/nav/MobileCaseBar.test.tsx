import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MobileCaseBar } from "./MobileCaseBar";

const nav = vi.hoisted(() => ({ pathname: "/en" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

class NoopObserver {
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", NoopObserver);
  Object.defineProperty(window, "scrollY", { configurable: true, writable: true, value: 0 });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const bar = () => render(<MobileCaseBar locale="en" label="Start my case" note="No commitment to start" />);
const scrollTo = (y: number) => act(() => { (window as { scrollY: number }).scrollY = y; fireEvent.scroll(window); });

describe("MobileCaseBar — the phone's persistent case action", () => {
  it("stays out of the way on the opening screen, then offers the action once the reader scrolls past it", () => {
    nav.pathname = "/en";
    const { container } = bar();
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute("inert");
    expect(document.documentElement.dataset.caseBar).toBeUndefined();

    scrollTo(900);
    expect(root).not.toHaveAttribute("inert");
    expect(screen.getByRole("link", { name: /Start my case/ })).toHaveAttribute("href", "/en/send-my-case");
    expect(document.documentElement.dataset.caseBar).toBe("on");
  });

  it("never appears where the patient is already in a task", () => {
    for (const path of ["/en/send-my-case", "/ar/portal", "/en/portal/cases/1", "/en/proposal/abc", "/en/track-case", "/en/consultants/hamdy-abdelazeem"]) {
      nav.pathname = path;
      const { container, unmount } = bar();
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });
});
