"use client";

import { useEffect, useState } from "react";

/** Pixels from the viewport top, below where an "On this page" jump lands a section (its `scroll-mt-28` plus any theme scroll padding). */
const READING_LINE = 240;

/**
 * The profile's "On this page" list for the sticky desktop rail: one link per section, the section being read marked
 * with `aria-current` and a drawn edge. The mark follows the reader from one passive, frame-throttled scroll listener.
 */
export function ProfileSectionNav({ label, sections }: { label: string; sections: readonly { id: string; title: string }[] }) {
  const [active, setActive] = useState(sections[0]?.id);
  const ids = sections.map((s) => s.id).join(" ");

  useEffect(() => {
    const targets = ids.split(" ").map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    let frame = 0;
    const update = () => {
      frame = 0;
      // The section being read is the last one whose top has passed the reading line below the floating header.
      const current = targets.filter((el) => el.getBoundingClientRect().top <= READING_LINE).at(-1) ?? targets[0];
      if (current) setActive(current.id);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [ids]);

  return (
    <nav aria-label={label}>
      <p className="eyebrow">{label}</p>
      <ul className="mt-4 grid border-s border-border-subtle">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              aria-current={active === s.id ? "location" : undefined}
              className="-ms-px block border-s-2 border-transparent py-2 ps-4 text-[0.9375rem] font-medium leading-6 text-ink-500 transition-colors hover:text-brand-700 aria-[current=location]:border-brand-700 aria-[current=location]:text-brand-900"
            >
              {s.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
