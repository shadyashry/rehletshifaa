/**
 * The selection-page hero facts: three derived numbers between hairlines. Values sit on one top line and
 * labels hang beneath them, so a label that wraps never pushes its number out of line with its neighbours.
 * (The term stays first in the DOM, as a description list requires; CSS order puts the value on top.)
 */
export function HeroStats({ stats }: { stats: readonly { value: number; label: string }[] }) {
  return (
    <dl className="hero-stats grid max-w-[34rem] grid-cols-3 divide-x divide-border-subtle border-y border-border-subtle">
      {stats.map((stat) => (
        <div key={stat.label} className="flex flex-col gap-2 px-3 py-4 first:ps-0 sm:px-5">
          <dt className="order-last text-[0.75rem] leading-4 text-ink-500 sm:text-[0.8125rem] sm:leading-5">{stat.label}</dt>
          <dd className="text-[1.5rem] font-semibold leading-none tracking-[-0.02em] text-brand-900 tabular-nums sm:text-[1.875rem]">{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}
