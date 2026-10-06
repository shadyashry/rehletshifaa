import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CareSelector, type SelectorSystem } from "./CareSelector";

afterEach(cleanup);

const system = (key: SelectorSystem["key"], title: string, areas: string[]): SelectorSystem => ({
  key,
  title,
  body: `${title} body`,
  meta: `${areas.length} care areas`,
  monograms: ["AA"],
  more: 0,
  consultants: "1 Consultant",
  names: "Dr A",
  areas: areas.map((area) => ({ slug: area.toLowerCase(), href: `/en/${area.toLowerCase()}`, title: area, short: `${area} short`, facets: [`${area} focus`], icon: "heart", consultants: "1 Consultant", people: ["AA"] })),
});

const systems = [
  system("heart", "Heart & circulation", ["Cardiology", "Vascular"]),
  system("neuro", "Brain, nerves & recovery", ["Neuroradiology"]),
  system("movement", "Bones & joints", ["Orthopedics"]),
];
const copy = {
  listLabel: "Body systems",
  ledBy: "Led by",
  unsure: "Not sure which one fits?",
  unsureAction: "Send your case",
  sendHref: "/en/send-my-case",
  nextTitle: "Is your case about {system}?",
  nextBody: "Your coordinator confirms the right Consultant.",
  nextAction: "Start my case",
};

describe("CareSelector — six systems as a selector, one panel at a time", () => {
  it("shows only the chosen system's panel and switches on click", () => {
    render(<CareSelector systems={systems} copy={copy} />);
    expect(screen.getByRole("tab", { name: /Heart & circulation/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Cardiology");

    fireEvent.click(screen.getByRole("tab", { name: /Bones & joints/ }));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Orthopedics");
    expect(screen.getByRole("tab", { name: /Heart & circulation/ })).toHaveAttribute("aria-selected", "false");
  });

  it("moves between systems with the arrow keys, Home and End, wrapping at the ends", () => {
    render(<CareSelector systems={systems} copy={copy} />);
    const first = screen.getByRole("tab", { name: /Heart & circulation/ });
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(screen.getByRole("tab", { name: /Brain, nerves/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Brain, nerves/ })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("tab", { name: /Brain, nerves/ }), { key: "End" });
    expect(screen.getByRole("tab", { name: /Bones & joints/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(screen.getByRole("tab", { name: /Bones & joints/ }), { key: "ArrowRight" });
    expect(first).toHaveAttribute("aria-selected", "true");
  });

  it("keeps every care-area link in the document and always offers the way out", () => {
    const { container } = render(<CareSelector systems={systems} copy={copy} />);
    expect(container.querySelectorAll('a[href="/en/cardiology"], a[href="/en/neuroradiology"], a[href="/en/orthopedics"]')).toHaveLength(3);
    expect(screen.getAllByRole("link", { name: /Not sure which one fits/ })[0]).toHaveAttribute("href", "/en/send-my-case");
    // The panel closes on the next step, phrased for the system just chosen.
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Is your case about heart & circulation?");
  });
});
