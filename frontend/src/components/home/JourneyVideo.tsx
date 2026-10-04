type JourneyVideoProps = { src: string; poster: string; label: string; watch: string; duration: string };

/** The journey film stays visible on the homepage, with native playback controls. */
export function JourneyVideo({ src, poster, label, watch, duration }: JourneyVideoProps) {
  return (
    <figure className="m-0 overflow-hidden rounded-[14px] border border-line bg-white">
      <video
        src={src}
        poster={poster}
        aria-label={label}
        controls
        playsInline
        preload="metadata"
        className="block aspect-video w-full bg-mist object-contain"
      >
        <a href={src}>{watch}</a>
      </video>
      <figcaption className="flex items-center gap-2 px-4 py-3 text-[0.95rem]">
        <span className="font-semibold text-brand-900">{watch}</span>
        <span aria-hidden="true" className="text-ink-400">·</span>
        <span className="tabular-nums text-ink-500">{duration}</span>
      </figcaption>
    </figure>
  );
}
