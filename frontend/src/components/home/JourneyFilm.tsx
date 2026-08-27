"use client";

import { useEffect, useState } from "react";
import { FileText, MapPinned, Pause, Play, Stethoscope, UserRoundCheck } from "lucide-react";

import { SectionHeader } from "@/components/SectionHeader";
import type { Dictionary } from "@/lib/dictionary";

const ICONS = [FileText, UserRoundCheck, Stethoscope, MapPinned] as const;
const SCENE_DURATION_MS = 4800;

export function JourneyFilm({ d }: { d: Dictionary }) {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const steps = d.home.video.steps;
  const current = steps[active] ?? steps[0];
  const CurrentIcon = ICONS[active] ?? FileText;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setActive((value) => (value + 1) % steps.length);
    }, SCENE_DURATION_MS);
    return () => window.clearInterval(timer);
  }, [playing, steps.length]);

  return (
    <section id="journey-video" className="section scroll-mt-24 border-b border-line bg-white">
      <div className="container-site">
        <SectionHeader eyebrow={d.home.video.eyebrow} title={d.home.video.title} intro={d.home.video.intro} />

        <div className="mt-10 grid overflow-hidden rounded-3xl border border-line bg-mist lg:grid-cols-[1.18fr_0.82fr]">
          <div className="relative min-h-[25rem] overflow-hidden bg-brand-900 p-6 text-white sm:p-9 lg:min-h-[32rem]">
            <div
              aria-hidden="true"
              className="absolute inset-0 opacity-90"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 18% 16%, rgba(101,189,181,.34), transparent 34%), radial-gradient(circle at 86% 74%, rgba(233,141,120,.23), transparent 32%)",
              }}
            />

            <div className="relative flex h-full min-h-[21rem] flex-col sm:min-h-[25rem] lg:min-h-[28rem]">
              <div className="flex items-center justify-between gap-4 text-sm text-white/80">
                <span>{d.home.video.duration}</span>
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 font-bold text-white transition hover:bg-white/20"
                  onClick={() => setPlaying((value) => !value)}
                  aria-label={playing ? d.home.video.pause : d.home.video.play}
                >
                  {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
                  {playing ? d.home.video.pause : d.home.video.play}
                </button>
              </div>

              <div key={active} className="journey-scene my-auto py-10" aria-live="polite">
                <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-brand-700 shadow-lg shadow-black/10">
                  <CurrentIcon size={30} strokeWidth={1.7} aria-hidden="true" />
                </div>
                <p className="mt-8 text-sm font-bold uppercase tracking-[0.12em] text-brand-300 rtl:tracking-normal rtl:normal-case">
                  {d.home.video.stepLabel} {String(active + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-3 max-w-xl text-3xl font-bold leading-tight tracking-[-0.025em] text-white rtl:tracking-normal rtl:leading-snug sm:text-4xl">
                  {current.title}
                </h3>
                <p className="mt-4 max-w-xl text-lg leading-8 text-white/85">{current.body}</p>
              </div>

              <div className="grid grid-cols-4 gap-2" aria-hidden="true">
                {steps.map((step, index) => (
                  <span key={step.title} className="h-1.5 overflow-hidden rounded-full bg-white/20">
                    <span
                      className={`block h-full rounded-full transition-[width] duration-500 ${index <= active ? "bg-brand-300" : "bg-transparent"}`}
                      style={{ width: index <= active ? "100%" : "0%" }}
                    />
                  </span>
                ))}
              </div>
            </div>
          </div>

          <ol className="grid content-center gap-1 p-4 sm:p-6 lg:p-8">
            {steps.map((step, index) => {
              const Icon = ICONS[index] ?? FileText;
              const selected = index === active;
              return (
                <li key={step.title}>
                  <button
                    type="button"
                    onClick={() => {
                      setActive(index);
                      setPlaying(false);
                    }}
                    aria-current={selected ? "step" : undefined}
                    className={`grid w-full grid-cols-[2.75rem_1fr] gap-3 rounded-2xl p-4 text-start transition sm:p-5 ${
                      selected ? "bg-white shadow-sm ring-1 ring-line" : "hover:bg-white/65"
                    }`}
                  >
                    <span className={`grid h-11 w-11 place-items-center rounded-xl ${selected ? "bg-brand-100 text-brand-700" : "bg-white text-ink-500"}`}>
                      <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
                    </span>
                    <span>
                      <strong className="block text-base text-brand-900">{step.title}</strong>
                      <span className="mt-1 block text-sm leading-6 text-ink-600">{step.body}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
