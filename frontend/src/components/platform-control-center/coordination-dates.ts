/**
 * Dates for versioned routing configuration (rules and clinician preferences). The backend requires a finite end
 * and refuses overlapping versions, so a new version starts exactly when the latest one ends — or now, if it has
 * already ended — never at a midnight that would overlap it.
 */
export const isoDay = (iso: string) => iso.slice(0, 10);
export const todayDay = () => new Date().toISOString().slice(0, 10);
export const plusYear = (value: string) => { const d = new Date(`${value}T00:00:00`); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10); };
export const earliestStart = (latestEnd: string | null | undefined) => (latestEnd && new Date(latestEnd).getTime() > Date.now() ? isoDay(latestEnd) : todayDay());
export function versionStart(day: string, latestEnd: string | null | undefined) {
  if (latestEnd && day === isoDay(latestEnd) && new Date(latestEnd).getTime() > Date.now()) return latestEnd;
  if (day === todayDay()) return new Date().toISOString();
  return new Date(`${day}T00:00:00`).toISOString();
}
export const versionEnd = (day: string) => new Date(`${day}T00:00:00`).toISOString();
