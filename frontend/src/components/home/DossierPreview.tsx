import { CaseStamp } from "@/components/brand/CaseStamp";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";

/**
 * What the patient receives, shown as the thing itself: three pages of the case file placed on the desk one after
 * another — case received, reviewed by a Consultant, a preliminary estimate — the first one stamped. Every word on
 * the pages describes what the platform actually produces; nothing is a figure, a name or a promise. The sample is
 * labelled as one. The pages read in document order as a list, which is also the order they are placed in.
 */
export function DossierPreview({ locale, d, children }: { locale: Locale; d: Dictionary; children?: React.ReactNode }) {
  const t = d.home.dossier;
  // The one synthetic stamp date on the platform: this sample page is labelled "Example".
  const today = new Date().toISOString();
  const pages = [
    { kicker: t.page3Kicker, title: t.page3Title, body: t.page3Body },
    { kicker: t.page2Kicker, title: t.page2Title, body: t.page2Body },
    { kicker: t.page1Kicker, title: t.page1Title, body: t.page1Body },
  ];

  return (
    <figure className="dossier m-0 w-full">
      <div className="relative">
        <span className="absolute end-0 top-0 z-[4] rounded-full border border-line-strong bg-surface-default px-2.5 py-0.5 text-[0.75rem] font-semibold leading-5 text-ink-500">{t.example}</span>
        <ol className="dossier-stack relative m-0 list-none p-0" aria-label={t.label}>
          {pages.map((page, index) => {
            const depth = pages.length - index; // 3 = the back page, 1 = the page on top
            return (
              <li key={page.kicker} className="dossier-page" data-depth={depth} style={{ zIndex: index + 1 }}>
                <p className="text-[0.75rem] font-semibold uppercase leading-5 tracking-[0.1em] text-ink-500 rtl:text-[0.8125rem] rtl:normal-case rtl:tracking-normal">{page.kicker}</p>
                <p className="mt-1 text-[1.0625rem] font-semibold leading-6 text-brand-900 [text-wrap:balance] sm:text-[1.125rem]" dir={depth === 1 ? "ltr" : undefined}>{page.title}</p>
                {/* Only the page on top is fully readable; the pages behind it show their heading, as a real stack does. */}
                {depth === 1 ? <p className="mt-1 text-[0.875rem] leading-6 text-ink-600">{page.body}</p> : <p className="sr-only">{page.body}</p>}
                {depth === 1 && <CaseStamp label={t.stamp} date={today} locale={locale} className="dossier-stamp absolute end-4 top-4" />}
              </li>
            );
          })}
        </ol>
      </div>
      {children}
    </figure>
  );
}
