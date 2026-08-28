import { PlayCircle } from "lucide-react";

/**
 * Placeholder for a real consultant-recorded introduction video. It never
 * fakes playback: it is a labelled figure describing what will appear once the
 * consultant's talk is recorded. When a hosted video exists, this component is
 * the single place to swap the poster for a <video>/<iframe>.
 */
export function ConsultantVideo({ label, title, note }: { label: string; title: string; note: string }) {
  return (
    <figure className="overflow-hidden rounded-3xl border border-line bg-white">
      <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-brand-900 text-white">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-90"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 18%, rgba(101,189,181,.32), transparent 36%), radial-gradient(circle at 84% 78%, rgba(233,141,120,.22), transparent 34%)",
          }}
        />
        <div className="relative flex flex-col items-center px-6 text-center">
          <span className="grid h-20 w-20 place-items-center rounded-full bg-white/12 ring-1 ring-white/25">
            <PlayCircle size={40} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <p className="mt-6 text-sm font-bold uppercase tracking-[0.14em] text-brand-300 rtl:tracking-normal rtl:normal-case">
            {label}
          </p>
          <p className="mt-2 max-w-md text-xl font-semibold leading-snug text-white">{title}</p>
        </div>
      </div>
      <figcaption className="border-t border-line p-5 text-sm leading-6 text-ink-600">{note}</figcaption>
    </figure>
  );
}
