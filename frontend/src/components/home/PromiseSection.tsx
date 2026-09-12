import type { Dictionary } from "@/lib/dictionary";

/**
 * The claim the whole platform rests on — a named Consultant owns the clinical decision — set as an
 * editorial statement on the clinical mist: the statement in the 5-column, and in the 7-column three
 * principles announced by large, quiet numerals and set as small-capital headings. No rows, no cards,
 * no icons; the numerals, the alignment and the whitespace carry it.
 */
export function PromiseSection({ d, locale }: { d: Dictionary; locale: string }) {
  const p = d.home.consultantsPromise;
  const principles = locale === "ar"
    ? [
        ["الاختصاص المناسب", "يُختار حسب الحاجة السريرية."],
        ["مسؤولية واضحة", "استشاري واحد يملك التوصية."],
        ["منسّق إلى جانبك", "شخص واحد يبقى معك طوال المسار."],
      ]
    : [
        ["Right specialty", "Matched to the clinical need."],
        ["Clear responsibility", "One Consultant owns the recommendation."],
        ["Coordinator alongside", "One person stays with you through the process."],
      ];

  return (
    <section className="canvas-clinical py-[clamp(2.5rem,1.9rem+1.8vw,3.75rem)]">
      <div className="container-site grid gap-8 sm:gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-16">
        <div className="lg:sticky lg:top-24 lg:pt-1">
          <p className="eyebrow">{p.eyebrow}</p>
          <h2 className="headline mt-2 max-w-[14ch] font-bold rtl:max-w-[22ch] [text-wrap:balance]">{p.title}</h2>
          <p className="mt-4 max-w-[44ch] text-[1.0625rem] leading-7 text-ink-700 [text-wrap:pretty] sm:mt-5 sm:leading-[1.7]">{p.body}</p>
        </div>

        <ol className="grid gap-6 sm:gap-7 lg:mt-1 lg:gap-9">
          {principles.map(([term, detail], index) => (
            <li key={term} className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-baseline gap-x-4 sm:grid-cols-[4.25rem_minmax(0,1fr)] sm:gap-x-6 lg:grid-cols-[5rem_minmax(0,1fr)]">
              <span aria-hidden className="select-none text-[2.5rem] font-semibold leading-none tracking-[-0.04em] tabular-nums text-brand-600/[0.45] sm:text-[3.25rem] lg:text-[3.75rem]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <h3 className="text-[1rem] font-bold uppercase leading-[1.3] tracking-[0.08em] text-brand-900 rtl:text-[1.2rem] rtl:normal-case rtl:tracking-normal sm:text-[1.0625rem]">{term}</h3>
                <p className="mt-1.5 max-w-[44ch] text-[1rem] leading-7 text-ink-600 sm:text-[1.0625rem]">{detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
