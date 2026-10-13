package com.rehletshifaa.casemanagement.api;

import com.rehletshifaa.casemanagement.api.CaseDtos.CreateCaseRequest;
import com.rehletshifaa.casemanagement.api.CaseDtos.NewCaseForPatientRequest;
import com.rehletshifaa.journey.api.JourneyDtos.CareCategoryUpdateRequest;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * The care areas a request may carry are the managed list (care_categories), checked by the services against the
 * table. Request validation must not keep its own shorter list: it did, and every care area added later was refused
 * before reaching the service — on the public form, a returning patient's next case and the coordinator's correction.
 */
class CareAreaRequestValidationTest {
    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @ParameterizedTest
    @ValueSource(strings = {"cardiology", "rheumatology-rehabilitation", "orthopedics", "vascular-endovascular-surgery",
            "gastroenterology-hepatology", "interventional-neuroradiology", "womens-health", "general-surgery",
            "plastic-reconstructive-surgery"})
    void everyManagedCareAreaPassesRequestValidation(String careArea) {
        assertThat(validator.validateValue(CreateCaseRequest.class, "careArea", careArea)).isEmpty();
        assertThat(validator.validateValue(NewCaseForPatientRequest.class, "careArea", careArea)).isEmpty();
        assertThat(validator.validateValue(CareCategoryUpdateRequest.class, "careCategory", careArea)).isEmpty();
    }
}
