package com.rehletshifaa.directory.domain;
import java.util.UUID;
/** Publish inside the mutation transaction when account/lifecycle, care area or display name changes. */
public record PractitionerDirectoryFactsChanged(UUID practitionerId) {}
