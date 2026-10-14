package com.rehletshifaa.shared.util;

/**
 * A projection that carries a patient's structured name. Names are encrypted at rest, so no query composes a
 * display name in SQL: it is composed here from the decrypted parts.
 */
public interface PatientNameParts {
    String getGivenName();
    String getFamilyName();

    default String getPatientName() { return PatientNames.displayOrNull(getGivenName(), getFamilyName()); }
}
