package com.rehletshifaa.casemanagement.application;

/**
 * The managed care-area list, as the case module needs it: only whether a slug exists. Implemented by the journey
 * module's {@code CareCategoryCatalog}, which owns the reference data, so intake checks the same table as the
 * coordinator's correction without the case module depending on its owner.
 */
public interface CareAreas {
    boolean exists(String slug);
}
