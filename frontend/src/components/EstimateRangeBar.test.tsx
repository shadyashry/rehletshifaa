import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { EstimateRangeBar, estimateParts } from "./EstimateRangeBar";
import { getDictionary } from "@/lib/dictionary";

afterEach(cleanup);

const en = getDictionary("en").portalWork.myCare.estimate.bar;
const ar = getDictionary("ar").portalWork.myCare.estimate.bar;
// Synthetic lines: two medical services and the platform's fee line, plus an optional extra the totals leave out.
const items = [
  { category: "MEDICAL", quantity: 1, unitPrice: 1800, optional: false },
  { category: "MEDICAL", quantity: 1, unitPrice: 5600, optional: false },
  { category: "PLATFORM_FEE", quantity: 1, unitPrice: 800, optional: false },
  { category: "MEDICAL", quantity: 1, unitPrice: 900, optional: true },
];

describe("estimateParts", () => {
  it("splits the expected total by category in the order the lines were listed, the fee line included and optional lines left out", () => {
    expect(estimateParts(items)).toEqual([{ category: "MEDICAL", amount: 7400 }, { category: "PLATFORM_FEE", amount: 800 }]);
  });

  it("does not split one category, a line without a category, or more categories than there are shades", () => {
    expect(estimateParts(items.filter(i => i.category === "MEDICAL"))).toEqual([]);
    expect(estimateParts([...items, { category: null, quantity: 1, unitPrice: 10, optional: false }])).toEqual([]);
    expect(estimateParts(["A", "B", "C", "D"].map(category => ({ category, quantity: 1, unitPrice: 10, optional: false })))).toEqual([]);
  });
});

describe("EstimateRangeBar", () => {
  it("is one image with one sentence, and its legend repeats every figure as text", () => {
    render(<EstimateRangeBar items={items} expected={8200} min={7800} max={9400} deposit={1230} currency="USD" locale="en" copy={en}/>);
    const bar = screen.getByRole("img");
    expect(bar.getAttribute("aria-label")).toBe(
      "Estimated range $7,800 to $9,400, expected $8,200. Made up of Medical care $7,400 and Coordination and guarantee fee $800. Coordination deposit $1,230, paid first.");
    const legend = document.querySelector("dl")!;
    expect(within(legend).getByText("Medical care")).toBeTruthy();
    expect(within(legend).getByText("Coordination and guarantee fee")).toBeTruthy();
    expect(legend.textContent).toContain("Expected$8,200");
    expect(legend.textContent).toContain("Estimated range$7,800 to $9,400");
    expect(legend.textContent).toContain("Coordination deposit");
    // Every amount is isolated left-to-right, so a currency sign never jumps sides in Arabic.
    expect([...legend.querySelectorAll("dd")].every(dd => dd.querySelector("bdi[dir=ltr]"))).toBe(true);
  });

  it("draws one scale from zero to the top of the range: the fill ends at the expected marker, the range and deposit bracketed", () => {
    const { container } = render(<EstimateRangeBar items={items} expected={8200} min={7800} max={9400} deposit={1230} currency="USD" locale="en" copy={en}/>);
    const pct = (selector: string, prop: "insetInlineStart" | "inlineSize") => parseFloat((container.querySelector(selector) as HTMLElement).style[prop]);
    expect(pct(".est-fill", "inlineSize")).toBeCloseTo((8200 / 9400) * 100, 3);
    expect(pct(".est-expected", "insetInlineStart")).toBeCloseTo((8200 / 9400) * 100, 3);
    expect(pct(".est-range", "insetInlineStart")).toBeCloseTo((7800 / 9400) * 100, 3);
    expect(pct(".est-range", "inlineSize")).toBeCloseTo((1600 / 9400) * 100, 3);
    expect(pct(".est-deposit", "inlineSize")).toBeCloseTo((1230 / 9400) * 100, 3);
    expect(container.querySelectorAll(".est-seg")).toHaveLength(2);
  });

  it("no range, no bracket; no deposit, no coral; one category is one segment; a final quote's total is its price", () => {
    const medical = items.filter(i => i.category === "MEDICAL");
    const { container } = render(<EstimateRangeBar items={medical} expected={7400} min={7400} max={7400} kind="quote" currency="USD" locale="en" copy={en}/>);
    expect(container.querySelector(".est-range")).toBeNull();
    expect(container.querySelector(".est-deposit")).toBeNull();
    expect(container.querySelectorAll(".est-seg")).toHaveLength(1);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Final package price $7,400.");
    expect(container.querySelector("dl")!.textContent).toBe("Final package price$7,400");
  });

  it("draws nothing without an expected total", () => {
    const { container } = render(<EstimateRangeBar items={[]} expected={0} currency="USD" locale="en" copy={en}/>);
    expect(container.firstChild).toBeNull();
  });

  it("reads in Arabic with the categories worded and the figures isolated", () => {
    render(<EstimateRangeBar items={items} expected={8200} min={7800} max={9400} currency="USD" locale="ar" copy={ar}/>);
    const label = screen.getByRole("img").getAttribute("aria-label")!;
    expect(label).toContain("النطاق التقديري من");
    expect(label).toContain("الرعاية الطبية");
    expect(label).toContain("رسوم التنسيق والضمان");
    expect(screen.getByText("الرعاية الطبية")).toBeTruthy();
  });
});
