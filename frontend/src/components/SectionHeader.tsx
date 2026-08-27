import type { ReactNode } from "react";

type SectionHeaderProps = {
  eyebrow: string;
  title: string;
  intro?: string;
  /** Optional trailing element, e.g. a link, aligned to the end on wide screens. */
  action?: ReactNode;
  /** Heading level for correct document outline. */
  as?: "h2" | "h3";
};

export function SectionHeader({ eyebrow, title, intro, action, as: Heading = "h2" }: SectionHeaderProps) {
  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <p className="eyebrow">{eyebrow}</p>
        <Heading className="headline mt-3">{title}</Heading>
        {intro ? <p className="lead mt-4">{intro}</p> : null}
      </div>
      {action ? <div className="shrink-0 md:pb-2">{action}</div> : null}
    </div>
  );
}
