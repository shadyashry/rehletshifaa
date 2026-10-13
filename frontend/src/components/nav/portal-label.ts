/** Where a signed-in person goes back to, in their words: patients (and the people acting for them) to My Care, staff to the portal. */
export function portalLabel(roles: readonly string[], labels: { myCare: string; portal: string }) {
  const staffOnly = roles.length > 0 && !roles.some(role => role === "PATIENT" || role === "PATIENT_REPRESENTATIVE");
  return staffOnly ? labels.portal : labels.myCare;
}
