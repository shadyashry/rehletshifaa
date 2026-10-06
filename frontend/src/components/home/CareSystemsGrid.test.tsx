import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CareSystemsGrid, type GridSystem } from "./CareSystemsGrid";

afterEach(cleanup);

const system = (key: GridSystem["key"], title: string, areas: string[], faces: string[], ledBy: string): GridSystem => ({
  key,
  icon: "heart",
  title,
  body: `${title} body`,
  areas: areas.map((area) => ({ slug: area.toLowerCase(), href: `/en/${area.toLowerCase()}`, title: area })),
  people: faces.map((initials) => ({ slug: initials.toLowerCase(), initials })),
  ledBy,
});

const systems = [
  system("heart", "Heart & circulation", ["Cardiology", "Vascular"], ["AA", "HA"], "Dr A and Dr H"),
  system("movement", "Bones & joints", ["Orthopedics"], ["HK", "AK", "MI", "MB"], "Dr K, Dr A and 2 more"),
];

describe("CareSystemsGrid — every body system visible at once", () => {
  it("shows every system with its care areas as links, nothing behind a click", () => {
    render(<CareSystemsGrid systems={systems} ledByLabel="Led by" />);
    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["Heart & circulation", "Bones & joints"]);
    expect(screen.getByRole("link", { name: "Cardiology" })).toHaveAttribute("href", "/en/cardiology");
    expect(screen.getByRole("link", { name: "Orthopedics" })).toHaveAttribute("href", "/en/orthopedics");
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("names the Consultants who lead each system, with at most three faces and a count for the rest", () => {
    render(<CareSystemsGrid systems={systems} ledByLabel="Led by" />);
    const bones = within(screen.getByRole("heading", { name: "Bones & joints" }).closest("li") as HTMLElement);
    expect(bones.getByText("Dr K, Dr A and 2 more")).toBeInTheDocument();
    expect(bones.getByText("+1")).toBeInTheDocument();
    expect(bones.queryByText("MB")).toBeNull();
  });
});
