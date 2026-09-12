"use client";

import { Play, X } from "lucide-react";
import Image from "next/image";
import { useCallback, useId, useRef, useState } from "react";

type JourneyVideoProps = {
  src: string;
  poster: string;
  /** Accessible description of the film for the video element. */
  label: string;
  watch: string;
  duration: string;
  dialogTitle: string;
  close: string;
};

/**
 * The film on the widths where a native player would be the tallest thing on the screen: a compact
 * poster card that opens the player in a native {@code <dialog>}, which gives the focus trap, Escape
 * handling and focus return for free. The player is mounted only while the dialog is open, so nothing
 * loads or keeps playing behind a closed lightbox, and nothing plays until the viewer presses play.
 */
export function JourneyVideo({ src, poster, label, watch, duration, dialogTitle, close }: JourneyVideoProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();

  const show = useCallback(() => {
    setOpen(true);
    dialogRef.current?.showModal();
  }, []);
  const hide = useCallback(() => dialogRef.current?.close(), []);

  return (
    <>
      <button
        type="button"
        onClick={show}
        className="group block w-full overflow-hidden rounded-[14px] border border-line bg-white text-start transition-colors hover:border-line-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        <span className="relative block aspect-video bg-mist">
          <Image src={poster} alt="" fill sizes="(min-width: 640px) 620px, 100vw" className="object-cover" />
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-white/95 text-brand-700 ring-1 ring-line transition-colors group-hover:bg-white">
              <Play size={22} strokeWidth={2} className="ms-0.5 fill-current" aria-hidden="true" />
            </span>
          </span>
        </span>
        <span className="flex items-center gap-2 px-4 py-3 text-[0.95rem]">
          <span className="font-semibold text-brand-900">{watch}</span>
          <span aria-hidden className="text-ink-400">·</span>
          <span className="tabular-nums text-ink-500">{duration}</span>
        </span>
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onClick={(event) => { if (event.target === dialogRef.current) hide(); }}
        className="m-auto w-[min(100%-1.5rem,56rem)] max-w-none overflow-hidden rounded-[14px] bg-brand-950 p-0 text-white backdrop:bg-brand-950/80"
      >
        <div className="flex items-center justify-between gap-3 ps-4 pe-2 py-2">
          <p id={titleId} className="text-[0.95rem] font-semibold">{dialogTitle}</p>
          <button
            type="button"
            onClick={hide}
            aria-label={close}
            className="grid h-11 w-11 place-items-center rounded-full text-white transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {open ? (
          <video className="block aspect-video w-full bg-black" controls playsInline preload="metadata" poster={poster} aria-label={label}>
            <source src={src} type="video/mp4" />
          </video>
        ) : (
          <div className="aspect-video w-full bg-black" aria-hidden />
        )}
      </dialog>
    </>
  );
}
