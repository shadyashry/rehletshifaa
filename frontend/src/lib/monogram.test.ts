import { describe, expect, it } from "vitest";

import ar from "@/messages/ar.json";
import en from "@/messages/en.json";
import { consultantMark, initials } from "./monogram";
import { plural } from "./portal-labels";

describe("Consultant marks and counts in Arabic (review 2026-10-30, P1-3)", () => {
  it("draws an Arabic name with its own first letter, skipping titles and the article", () => {
    expect(consultantMark({ initials: "AA", name: "د. أحمد العشري" })).toBe("أ");
    expect(consultantMark({ initials: "MZ", name: "أ.د. محمد حمدي زايد" })).toBe("م");
    expect(initials("الدكتورة حنان الشورى")).toBe("ح");
  });

  it("keeps initials written in the name's own script", () => {
    expect(consultantMark({ initials: "AA", name: "Dr Ahmed AlAshry" })).toBe("AA");
    expect(consultantMark({ initials: "ع", name: "د. عمرو عبد العظيم" })).toBe("ع");
    expect(consultantMark({ initials: "", name: "Dr Ahmed AlAshry" })).toBe("AA");
  });

  it("counts Consultants with every Arabic plural form", () => {
    const forms = ar.portalWork.plural.consultants;
    expect([1, 2, 3, 10, 11, 13, 100].map((n) => plural("ar", n, forms))).toEqual([
      "استشاري واحد", "استشاريان", "3 استشاريين", "10 استشاريين", "11 استشاريًا", "13 استشاريًا", "100 استشاري",
    ]);
    expect([1, 13].map((n) => plural("en", n, en.portalWork.plural.consultants))).toEqual(["1 Consultant", "13 Consultants"]);
    expect(plural("ar", 2, ar.careAreasPage.atlas.areas)).toBe("مجالا رعاية");
  });
});
