import { TriangleAlert } from "lucide-react";

/**
 * The one emergency instruction a patient sees on Send my case, the status link and My Care (review 2026-10-14, A-02):
 * RehletShifaa coordinates planned care, so anyone in an emergency is told to seek local care now. A static note, not
 * a live alert: it is read in page order and never interrupts a screen reader. Logical properties only, so the accent
 * edge sits at the start of the line in Arabic and English alike.
 */
export function EmergencyGuidance({ title, body, className = "" }: { title: string; body: string; className?: string }) {
  return (
    <aside role="note" aria-label={title}
           className={`flex items-start gap-3 rounded-lg border border-alert-200 border-s-4 border-s-alert-600 bg-alert-50 px-4 py-3 ${className}`}>
      <TriangleAlert size={18} aria-hidden className="mt-0.5 flex-none text-alert-700"/>
      <div className="min-w-0">
        <p className="text-[0.9375rem] font-bold leading-6 text-alert-800">{title}</p>
        <p className="mt-0.5 text-[0.875rem] leading-6 text-ink-700">{body}</p>
      </div>
    </aside>
  );
}
