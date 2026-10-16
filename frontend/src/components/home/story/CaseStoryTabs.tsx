"use client";

import { Check, ClipboardCheck, FileUp, HeartPulse, Pause, Play, Signpost, Stethoscope } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

type Step = { label: string };

/** One picture per step of How It Works, in order: send, review, the plan, the decision, care and follow-up. */
const STEP_ICONS = [FileUp, Stethoscope, ClipboardCheck, Signpost, HeartPulse];

/**
 * The only client part of the hero story: which scene is showing. Every scene is server-rendered and stays mounted;
 * the inactive ones are `visibility: hidden` in the same grid cell, so the panel keeps the height of its tallest scene
 * and nothing below it shifts as the story moves on. A scene's motion runs only while it carries `data-active`, so
 * showing it again replays it.
 *
 * The steps read as one journey: icon nodes on a line that fills petrol up to where the story is. Timing lives in CSS:
 * the current step's coral ring draws itself around its icon over the scene's duration and its `animationend` moves
 * the story on. Pausing (the button, hover or keyboard focus inside) pauses the ring, and with reduced motion the ring
 * is simply whole, so the story never advances by itself.
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
          const done = index < active;
          const Icon = STEP_ICONS[index] ?? FileUp;
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
              data-state={selected ? "active" : done ? "done" : "next"}
              className="case-story-tab"
              onClick={() => select(index)}
            >
              <span aria-hidden className="case-story-node">
                <Icon size={17} strokeWidth={2} />
                {selected ? (
                  <svg className="case-story-ring" viewBox="0 0 44 44" focusable="false">
                    <circle className="case-story-ring-track" cx="22" cy="22" r="20" />
                    <circle
                      key={`ring-${active}`}
                      className="case-story-ring-fill"
                      cx="22"
                      cy="22"
                      r="20"
                      pathLength={1}
                      onAnimationEnd={(event) => { if (event.target === event.currentTarget) select(active + 1); }}
                    />
                  </svg>
                ) : null}
                {done ? <span className="case-story-node-done"><Check size={9} strokeWidth={3.4} /></span> : null}
              </span>
              <span className="case-story-tab-label">{step.label}</span>
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
