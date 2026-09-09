package com.rehletshifaa.shared.api;

import java.util.ArrayList;
import java.util.List;

/**
 * Semantic (business-rule) validation failure carrying per-field messages, rendered through the same
 * {@link ApiError} shape as Jakarta bean-validation so the client handles one error contract only.
 */
public class FieldValidationException extends RuntimeException {
    private final List<ApiError.FieldError> errors;
    public FieldValidationException(List<ApiError.FieldError> errors) {
        super("The request contains invalid fields");
        this.errors = List.copyOf(errors);
    }
    public List<ApiError.FieldError> errors() { return errors; }

    /** Small accumulator so a submission reports every bad field at once, not just the first. */
    public static final class Collector {
        private final List<ApiError.FieldError> errors = new ArrayList<>();
        public Collector reject(String field, String message) { errors.add(new ApiError.FieldError(field, message)); return this; }
        public boolean hasErrors() { return !errors.isEmpty(); }
        public void throwIfInvalid() { if (!errors.isEmpty()) throw new FieldValidationException(errors); }
    }
}
