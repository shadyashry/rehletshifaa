package com.rehletshifaa.identity.operations;

import com.rehletshifaa.directory.infrastructure.PractitionerProfileRepository;
import com.rehletshifaa.shared.persistence.PlatformGovernanceLockRepository;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.workforce.application.WorkforceEnrolment;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

@Service
public class IdentityOperationCompletionService {
    private final PractitionerProfileRepository practitioners;
    private final PlatformGovernanceLockRepository governanceLock;
    private final IdentityOperationStore store;
    private final WorkforceEnrolment enrolment;
    private final Clock clock;

    public IdentityOperationCompletionService(IdentityOperationStore store, WorkforceEnrolment enrolment, Clock clock, PlatformGovernanceLockRepository governanceLock, PractitionerProfileRepository practitioners) { this.practitioners = practitioners; this.governanceLock = governanceLock;
        this.enrolment = enrolment;
        this.store = store;
        this.clock = clock;
    }

    @Transactional
    public void created(IdentityOperationStore.Operation operation, String subject) {
        // Serialize identity attachment with invitation cancellation, acceptance and role/governance changes.
        governanceLock.acquire();
        if ("WorkforceInvitation".equals(operation.targetType())) completeInvitation(operation, subject);
        else if ("Practitioner".equals(operation.targetType())) completePractitioner(operation, subject);
        else throw new ApiException(409, "IDENTITY_OPERATION_TARGET_INVALID", "Identity operation target is invalid");
        if (!store.succeeded(operation, subject)) throw new ApiException(409, "IDENTITY_OPERATION_CONFLICT", "Identity operation changed while completing");
    }

    /**
     * STF-01/02: the identity now exists, so the invited person and their invited roles are recorded. The person is
     * INVITED with inactive platform access; the roles take effect only after activation with MFA.
     */
    private void completeInvitation(IdentityOperationStore.Operation operation, String subject) {
        if (!enrolment.enrolProvisioned(operation.targetId(), subject, clock.instant()))
            throw new ApiException(409, "INVITATION_IDENTITY_CONFLICT", "The invitation no longer matches this operation");
    }

    private void completePractitioner(IdentityOperationStore.Operation operation, String subject) {
        int changed = practitioners.bindIdentity(operation.targetId(), subject, micros(clock.instant()));
        if (changed != 1) throw new ApiException(409, "PRACTITIONER_IDENTITY_CONFLICT", "Consultant identity no longer matches this operation");
    }
}
