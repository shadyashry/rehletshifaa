import { TriangleAlert } from "lucide-react";

/**
 * Clinical safety notice. Deliberately not dismissible and always ahead of the
 * header in the reading order, but visually restrained so it reads as guidance
 * rather than as the page's headline.
 */
export function EmergencyNotice({ label, text }: { label: string; text: string }) {
  return (
    <aside
      aria-label={label}
      className="border-b border-alert-200 bg-alert-50 text-alert-800"
    >
      <div className="container-site flex items-start gap-2.5 py-2.5">
        <TriangleAlert size={15} className="mt-[3px] text-alert-700" aria-hidden="true" />
        <p className="text-[0.8125rem] leading-5">
          <span className="font-semibold">{label}:</span> {text}
        </p>
      </div>
    </aside>
  );
}
