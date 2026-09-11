import type { Dictionary } from "@/lib/dictionary";

/**
 * The claim the whole platform rests on: a named Consultant owns the clinical decision. Set as an
 * editorial statement — large type on a quiet tint, with the three facts that back it ruled beneath —
 * because there is no authorised clinician photography, and inventing a face here would undo the trust
 * the words are trying to earn.
 */
export function PromiseSection({ d, locale }: { d: Dictionary; locale: string }) {
  const p = d.home.consultantsPromise;
  const facts = locale === "ar"
    ? [
        ["الاختصاص المناسب", "نوجّه حالتك حسب الحاجة السريرية، فلا يقع عليك اختيار التخصص."],
        ["مسؤولية واضحة", "استشاري واحد يحمل القرار، وتعرف من هو."],
        ["منسّق إلى جانبك", "شخص واحد يجهّز حالتك ويبقى معك بعد المراجعة."],
      ]
    : [
        ["The right specialty", "We route your case by clinical need, so choosing a specialty is not your job."],
        ["Clear responsibility", "One Consultant carries the decision, and you will know who they are."],
        ["A coordinator alongside", "One person prepares your case and stays with you after the review."],
      ];

  return (
    <section className="section border-y border-line bg-brand-50/60">
      <div className="container-site grid gap-5 sm:gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start lg:gap-14">
        <div>
          <p className="eyebrow">{p.eyebrow}</p>
          <h2 className="headline mt-1.5 max-w-[15ch] rtl:max-w-[22ch] [text-wrap:balance] sm:mt-2">{p.title}</h2>
        </div>
        <div>
          <p className="text-[0.98rem] leading-7 text-ink-700 sm:text-[1.05rem] sm:leading-8">{p.body}</p>
          <dl className="mt-4 grid gap-x-8 gap-y-3 sm:mt-6 sm:grid-cols-3 sm:gap-y-4">
            {facts.map(([term, detail]) => (
              <div key={term} className="border-t border-brand-200 pt-3 sm:pt-3.5">
                <dt className="text-[0.92rem] font-semibold text-brand-900">{term}</dt>
                <dd className="mt-0.5 text-[0.86rem] leading-6 text-ink-600 sm:mt-1">{detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
