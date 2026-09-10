import type { Dictionary } from "@/lib/dictionary";

/**
 * The process as a journey rather than a specification: four nodes on one rule, read left to right on a
 * desktop and top to bottom on a phone. The film that used to sit beside these steps now opens the page,
 * so this section says the same thing once, in the shape of the thing it describes.
 */
export function JourneyFilm({ d }: { d: Dictionary }) {
  const steps = d.home.video.steps;

  return (
    <section id="how-it-works" className="section scroll-mt-20 border-b border-line bg-white">
      <div className="container-site">
        <div className="max-w-2xl">
          <p className="eyebrow">{d.home.howEyebrow}</p>
          <h2 className="headline mt-2">{d.home.howTitle}</h2>
          <p className="lead mt-3">{d.home.howIntro}</p>
        </div>

        <ol className="mt-9 grid gap-y-7 sm:grid-cols-2 lg:grid-cols-4 lg:gap-x-7">
          {steps.map((step, index) => (
            <li key={step.title} className="relative lg:pe-7">
              {/* The rule is the journey, so it links nodes and stops at the last one. */}
              {index < steps.length - 1 && (
                <span aria-hidden className="absolute inset-x-0 top-[7px] hidden h-px bg-line-strong lg:block" />
              )}
              <span aria-hidden className="relative block h-[15px] w-[15px] rounded-full border-[3px] border-brand-600 bg-white" />
              <p className="mt-4 text-[0.72rem] font-bold tracking-[0.14em] text-accent-700" aria-hidden>
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-1 text-[1.02rem] font-semibold leading-6 text-brand-900">{step.title}</h3>
              <p className="mt-1.5 max-w-[30ch] text-[0.9rem] leading-6 text-ink-600">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
