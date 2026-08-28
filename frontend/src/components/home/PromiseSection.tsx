import { UserRoundCheck } from "lucide-react";

import type { Dictionary } from "@/lib/dictionary";

/**
 * The brand promise that differentiates RehletShifaa: a named, accountable
 * consultant owns the clinical decision — "consultants, not just specialists".
 */
export function PromiseSection({ d }: { d: Dictionary }) {
  const p = d.home.consultantsPromise;
  return (
    <section className="section section-soft">
      <div className="container-site max-w-3xl text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white text-accent-700 ring-1 ring-line">
          <UserRoundCheck size={26} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <p className="eyebrow mt-6">{p.eyebrow}</p>
        <h2 className="headline mt-3">{p.title}</h2>
        <p className="lead mt-4">{p.body}</p>
      </div>
    </section>
  );
}
