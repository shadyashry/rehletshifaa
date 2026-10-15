import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import ar from "@/messages/ar.json";

import { phaseLabels } from "./patient-journey";

/**
 * The patient's journey is one journey, whichever door the file is opened through: the secure status link
 * (`secureLink.journey`) and My Care (`portalWork.myCare.journey`) name its phases, its title and its step states with
 * the same words in each language. The status link's phase map is the source; My Care's copy must match it.
 */
describe("one journey, one set of words", () => {
  for (const [locale, d] of [["en", en], ["ar", ar]] as const) {
    it(`uses the same phase names, title and states on the status link and in My Care (${locale})`, () => {
      expect(d.portalWork.myCare.journey.phases).toEqual(phaseLabels(d.secureLink.journey));
      expect(d.portalWork.myCare.journey.title).toBe(d.secureLink.status.journey);
      expect(d.portalWork.myCare.journey.done).toBe(d.secureLink.journey.done);
      expect(d.portalWork.myCare.journey.current).toBe(d.secureLink.journey.current);
    });
  }
});
