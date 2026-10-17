package com.rehletshifaa.clinic.domain;
import java.util.UUID;
public record ConsultantDirectoryChanged(UUID practitionerId, String slug, String reason, long version) {}
