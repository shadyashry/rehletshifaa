import type { ReactNode } from "react";

export function PageHero({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children?: ReactNode;
}) {
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
