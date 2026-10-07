import type { ReactElement, ReactNode } from "react";
import { render } from "@testing-library/react";

import { WorkCopyProvider } from "@/components/portal/portal-copy";
import { careAreaAtlas } from "@/lib/care-area-catalog";
import { getDictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import type { WorkCopy } from "@/lib/portal-labels";

/** The same staff work copy the portal page builds on the server, for component tests. */
export function workCopyFor(locale: Locale): WorkCopy {
  const d = getDictionary(locale);
  return { ...d.portalWork, careAreas: Object.fromEntries(careAreaAtlas(locale, d).map((area) => [area.slug, area.title])) };
}

/** Renders inside the work-copy provider; `rerender` keeps the provider. */
export function renderWithWork(ui: ReactElement, locale: Locale = "en") {
  const copy = workCopyFor(locale);
  return render(ui, { wrapper: ({ children }: { children: ReactNode }) => <WorkCopyProvider copy={copy}>{children}</WorkCopyProvider> });
}
