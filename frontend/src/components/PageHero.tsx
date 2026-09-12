import type { ReactNode } from "react";

export function PageHero({
  eyebrow,
  title,
  intro,
  children,
  aside,
  tone = "mist",
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children?: ReactNode;
  /** Pearl tone only: a compact visual that sits beside the copy from lg and under it below. */
  aside?: ReactNode;
  /** "pearl": the quiet selection-page hero — pearl canvas, a barely-there clinical mist, no glow. */
  tone?: "mist" | "pearl";
}) {
  if (tone === "pearl") {
    return (
      <section className="border-b border-border-subtle bg-surface-pearl bg-[radial-gradient(70%_120%_at_88%_-10%,var(--color-surface-clinical),var(--color-surface-pearl)_72%)]">
        <div className={`container-site pb-11 pt-9 md:pb-12 md:pt-12 ${aside ? "lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-center lg:gap-x-16" : ""}`}>
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h1 className="display mt-3 max-w-[22ch] rtl:max-w-[30ch] [text-wrap:balance]">{title}</h1>
            <p className="lead mt-4 max-w-[58ch] sm:mt-5">{intro}</p>
            {children ? <div className="mt-5 sm:mt-6">{children}</div> : null}
          </div>
          {aside ? <div className="mt-7 lg:mt-0">{aside}</div> : null}
        </div>
      </section>
    );
  }

  return (
    <section className="relative overflow-hidden border-b border-line bg-mist">
      <div aria-hidden className="absolute -end-28 -top-40 h-96 w-96 rounded-full bg-brand-100/70 blur-3xl" />
      <div className="container-site relative py-11 md:py-14">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="display mt-3 max-w-4xl">{title}</h1>
        <p className="lead mt-4 max-w-3xl">{intro}</p>
        {children ? <div className="mt-6">{children}</div> : null}
      </div>
    </section>
  );
}
