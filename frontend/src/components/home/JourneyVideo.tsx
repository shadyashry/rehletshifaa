"use client";

import { Play } from "lucide-react";
import { useRef, useState } from "react";

type JourneyVideoProps = { src: string; poster: string; label: string; watch: string; duration: string; play: string };

/**
 * The journey film stays on the homepage, inline. Before playback it is a composed poster — the film's
 * own still, a soft ink gradient, one play control and the duration — rather than a bare native control
 * bar across the image; pressing play starts the film in place with native controls.
 */
export function JourneyVideo({ src, poster, label, watch, duration, play }: JourneyVideoProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  const start = () => {
    setStarted(true);
    requestAnimationFrame(() => void video.current?.play().catch(() => undefined));
  };

  return (
    <figure className="m-0 overflow-hidden rounded-[16px] border border-border-card bg-surface-default shadow-[0_28px_56px_-40px_rgba(36,64,74,0.55)]">
      <div className="relative aspect-video bg-brand-950">
        <video
          ref={video}
          src={src}
          poster={poster}
          aria-label={label}
          controls={started}
          playsInline
          preload="metadata"
          className="block h-full w-full object-cover"
        >
          <a href={src}>{watch}</a>
        </video>
        {started ? null : (
          <button
            type="button"
            onClick={start}
            aria-label={`${play} — ${label}`}
            className="group absolute inset-0 grid place-items-center bg-[linear-gradient(180deg,rgba(28,51,58,0.05)_35%,rgba(28,51,58,0.55)_100%)] focus-visible:outline-3 focus-visible:-outline-offset-4 focus-visible:outline-white"
          >
            <span className="relative grid h-16 w-16 place-items-center rounded-full bg-surface-default/95 text-brand-700 shadow-[0_14px_34px_-12px_rgba(0,0,0,0.55)] transition-transform duration-300 group-hover:scale-105 motion-reduce:transform-none sm:h-[4.5rem] sm:w-[4.5rem]">
              <span aria-hidden className="absolute inset-0 rounded-full ring-8 ring-white/25" />
              <Play size={24} fill="currentColor" strokeWidth={0} className="ml-1" aria-hidden="true" />
            </span>
            <span className="absolute bottom-4 start-4 inline-flex items-center gap-2 rounded-full bg-brand-950/55 px-3 py-1.5 text-[0.8125rem] font-semibold text-white backdrop-blur-sm sm:bottom-5 sm:start-5">
              {watch}
              <span aria-hidden className="text-white/60">·</span>
              <span className="tabular-nums text-white/85">{duration}</span>
            </span>
          </button>
        )}
      </div>
    </figure>
  );
}
