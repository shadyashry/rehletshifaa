"use client";

import { Pause, Play } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

type Step = { label: string };

/**
 * The only client part of the hero story: which scene is showing. Every scene is server-rendered and stays mounted;
 * the inactive ones are `visibility: hidden` in the same grid cell, so the panel keeps the height of its tallest scene
 * and nothing below it shifts as the story moves on. A scene's motion runs only while it carries `data-active`, so
 * showing it again replays it.
 *
 * Timing lives in CSS: the active step's progress line fills over the scene's duration and its `animationend` moves
 * the story on. Pausing (the button, hover or keyboard focus inside) pauses that line, and with reduced motion the
 * line does not animate at all, so the story never advances by itself.
 */
export function CaseStoryTabs({ label, steps, scenes, pauseLabel, playLabel }: {
  label: string;
  steps: Step[];
  scenes: ReactNode[];
  pauseLabel: string;
  playLabel: string;
}) {
  const id = useId();
  const [active, setActive] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const paused = stopped || hovered || focused;

  const select = (index: number, focus = false) => {
    const next = (index + steps.length) % steps.length;
    setActive(next);
    if (focus) tabs.current[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Arrow keys follow reading direction: in Arabic the next step is to the left.
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    const back = rtl ? "ArrowRight" : "ArrowLeft";
    if (event.key === forward) select(active + 1, true);
    else if (event.key === back) select(active - 1, true);
    else if (event.key === "Home") select(0, true);
    else if (event.key === "End") select(steps.length - 1, true);
    else return;
    event.preventDefault();
  };

  return (
    <div
      className="case-story"
      data-paused={paused ? "" : undefined}
      onPointerEnter={(event) => { if (event.pointerType === "mouse") setHovered(true); }}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}
    >
      <div role="tablist" aria-label={label} className="case-story-tabs" onKeyDown={onKeyDown}>
        {steps.map((step, index) => {
          const selected = index === active;
          return (
            <button
              key={step.label}
              ref={(node) => { tabs.current[index] = node; }}
              type="button"
              role="tab"
              id={`${id}-tab-${index}`}
              aria-selected={selected}
              aria-controls={`${id}-panel-${index}`}
              tabIndex={selected ? 0 : -1}
              data-state={selected ? "active" : index < active ? "done" : "next"}
              className="case-story-tab"
              onClick={() => select(index)}
            >
              <span aria-hidden className="case-story-tab-number">{index < active ? "✓" : index + 1}</span>
              <span className="case-story-tab-label">{step.label}</span>
              {selected ? (
                <span
                  aria-hidden
                  key={`progress-${active}`}
                  className="case-story-progress"
                  onAnimationEnd={(event) => { if (event.target === event.currentTarget) select(active + 1); }}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="case-story-stage">
        {scenes.map((scene, index) => (
          <div
            key={index}
            role="tabpanel"
            id={`${id}-panel-${index}`}
            aria-labelledby={`${id}-tab-${index}`}
            className="case-story-scene"
            data-active={index === active ? "" : undefined}
            inert={index !== active}
          >
            {scene}
          </div>
        ))}
        {/* Over the photograph's lower end corner, where no scene places a tag. */}
        <button type="button" className="case-story-toggle" onClick={() => setStopped((value) => !value)}>
          {stopped ? <Play size={13} aria-hidden /> : <Pause size={13} aria-hidden />}
          {stopped ? playLabel : pauseLabel}
        </button>
      </div>
    </div>
  );
}
