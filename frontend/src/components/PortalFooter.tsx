import Link from "next/link";

import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { legalNav } from "@/lib/links";

/**
 * The portal is an application, so it ends on one quiet line instead of the marketing footer: the legal pages and the
 * copyright. No link groups, no invitation to send a case — the people here are already inside their work or care.
 */
export function PortalFooter({ locale, d }: { locale: Locale; d: Dictionary }) {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-line text-ink-600">
      <div className="container-site flex flex-col gap-x-8 gap-y-1 py-3 text-[0.875rem] sm:flex-row sm:items-center sm:justify-between">
        <p className="py-2">© {year} {d.common.brand}</p>
        <nav aria-label={d.footer.legal}>
          <ul className="flex flex-wrap gap-x-5">
            {legalNav(locale, d).map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="footer-link inline-flex min-h-11 items-center">{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
