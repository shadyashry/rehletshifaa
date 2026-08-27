export type AnalyticsEvent = "send_case_cta_clicked" | "case_form_started" | "medical_file_uploaded" | "case_submitted" | "whatsapp_clicked" | "consultant_profile_viewed";

export function track(event: AnalyticsEvent) {
  if (typeof window === "undefined") return;
  const safePayload = { event };
  window.dispatchEvent(new CustomEvent("rehletshifaa:analytics", { detail: safePayload }));
  const dataLayer = (window as typeof window & { dataLayer?: unknown[] }).dataLayer;
  dataLayer?.push(safePayload);
}

