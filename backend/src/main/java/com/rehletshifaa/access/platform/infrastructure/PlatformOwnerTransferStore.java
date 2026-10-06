package com.rehletshifaa.access.platform.infrastructure;

import com.rehletshifaa.access.platform.domain.PlatformOwnerPointer;
import com.rehletshifaa.access.platform.domain.PlatformOwnerRelationship;
import com.rehletshifaa.access.platform.domain.PlatformOwnerTransfer;
import com.rehletshifaa.access.platform.domain.PlatformOwnerTransferEvidence;
import com.rehletshifaa.shared.api.ApiException;
import com.rehletshifaa.shared.audit.GovernanceAuditLog;
import com.rehletshifaa.workforce.infrastructure.AccessSubjectRepository;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static com.rehletshifaa.shared.persistence.SqlValues.micros;

@Repository
public class PlatformOwnerTransferStore {
    private final PlatformAccessRepository access;
    private final GovernanceAuditLog audit;
    private final AccessSubjectRepository accessSubjects;
    private final PlatformOwnerRelationshipRepository relationships;
    private final PlatformOwnerPointerRepository ownerPointer;
    private final PlatformOwnerTransferRepository transfers;
    private final PlatformOwnerTransferAcceptanceRepository acceptances;
    private final PlatformOwnerTransferVerificationRepository verifications;

    public PlatformOwnerTransferStore(PlatformAccessRepository access, GovernanceAuditLog audit, AccessSubjectRepository accessSubjects,
                                      PlatformOwnerRelationshipRepository relationships, PlatformOwnerPointerRepository ownerPointer,
                                      PlatformOwnerTransferRepository transfers, PlatformOwnerTransferAcceptanceRepository acceptances,
                                      PlatformOwnerTransferVerificationRepository verifications) {
        this.access = access; this.audit = audit; this.accessSubjects = accessSubjects; this.relationships = relationships;
        this.ownerPointer = ownerPointer; this.transfers = transfers; this.acceptances = acceptances; this.verifications = verifications;
    }

    public String currentOwner() {
        return findCurrentOwner()
                .orElseThrow(() -> new ApiException(409, "PLATFORM_OWNER_NOT_INITIALIZED", "Platform ownership has not been initialized"));
    }

    public Optional<String> findCurrentOwner() {
        return ownerPointer.findById(PlatformOwnerPointer.ID).flatMap(pointer -> relationships.findById(pointer.getRelationshipId()))
                .filter(PlatformOwnerRelationship::isCurrent).map(PlatformOwnerRelationship::getSubject);
    }

    public Transfer create(String actor, String incomingOwner, String reason, Instant now, Instant expiresAt) {
        access.lockGovernance();
        String currentOwner = currentOwner();
        if (!currentOwner.equals(actor))
            throw new ApiException(403, "CURRENT_OWNER_REQUIRED", "Only the current Platform Account Owner can initiate a transfer");
        if (currentOwner.equals(incomingOwner))
            throw new ApiException(409, "OWNER_TRANSFER_REQUIRES_SUCCESSOR", "Choose a different incoming Platform Account Owner");
        if (transfers.existsByStatusInAndExpiresAtAfter(PlatformOwnerTransferRepository.LIVE, micros(now)))
            throw new ApiException(409, "OWNER_TRANSFER_ALREADY_PENDING", "Complete or expire the existing owner transfer first");
        UUID id = UUID.randomUUID();
        transfers.saveAndFlush(new PlatformOwnerTransfer(id, currentOwner, incomingOwner, actor, reason, now, expiresAt));
        audit.record(actor, id.toString(), "PLATFORM_OWNER_TRANSFER_INITIATED", "SUCCESS", "incomingOwner=" + incomingOwner + "; " + reason);
        return forUpdate(id);
    }

    public Transfer forUpdate(UUID id) {
        return transfers.lockById(id).map(PlatformOwnerTransferStore::transfer)
                .orElseThrow(() -> new ApiException(404, "OWNER_TRANSFER_NOT_FOUND", "Platform owner transfer not found"));
    }

    public Transfer accept(Transfer transfer, String actor, String reason, Instant now) {
        if (transfers.advance(transfer.id(), transfer.revision(), List.of("PENDING_ACCEPTANCE"), "PENDING_VERIFICATION") != 1) stale();
        acceptances.saveAndFlush(new PlatformOwnerTransferEvidence.Acceptance(transfer.id(), actor, reason, now));
        audit.record(actor, transfer.id().toString(), "PLATFORM_OWNER_TRANSFER_ACCEPTED", "SUCCESS", reason);
        return forUpdate(transfer.id());
    }

    public Transfer complete(Transfer transfer, String verifier, String verificationReason, Instant now) {
        access.lockGovernance();
        Transfer locked = forUpdate(transfer.id());
        if (locked.revision() != transfer.revision() || !locked.status().equals("PENDING_VERIFICATION")) stale();
        String currentOwner = currentOwner();
        if (!currentOwner.equals(locked.currentOwner())) stale();
        if (!acceptances.existsByRequestIdAndAcceptedBy(locked.id(), locked.incomingOwner()))
            throw new ApiException(409, "OWNER_SUCCESSOR_NOT_ACCEPTED", "The incoming owner must accept before verification");

        PlatformOwnerPointer pointer = ownerPointer.lockById(PlatformOwnerPointer.ID).orElseThrow();
        UUID oldRelationship = pointer.getRelationshipId();
        PlatformOwnerRelationship previous = relationships.lockById(oldRelationship).orElseThrow(PlatformOwnerTransferStore::staleException);
        if (!previous.end(now)) stale();
        relationships.saveAndFlush(previous);
        accessSubjects.ensureExists(locked.incomingOwner(), true);
        PlatformOwnerRelationship next = relationships.saveAndFlush(
                new PlatformOwnerRelationship(locked.incomingOwner(), now, verifier, "Accepted owner transfer " + locked.id()));
        PlatformOwnerPointer current = ownerPointer.lockById(PlatformOwnerPointer.ID).orElseThrow();
        if (!current.move(oldRelationship, next.getId())) stale();
        ownerPointer.saveAndFlush(current);
        verifications.saveAndFlush(new PlatformOwnerTransferEvidence.Verification(locked.id(), verifier, verificationReason, now));
        if (transfers.advance(locked.id(), locked.revision(), List.of("PENDING_VERIFICATION"), "COMPLETED") != 1) stale();
        audit.record(verifier, locked.id().toString(), "PLATFORM_OWNER_TRANSFER_COMPLETED", "SUCCESS",
                "oldOwner=" + locked.currentOwner() + "; incomingOwner=" + locked.incomingOwner() + "; " + verificationReason);
        return forUpdate(locked.id());
    }

    /** Newest first, bounded: the ownership page's history. */
    public List<Transfer> recent(int limit) {
        return transfers.findNewest(Limit.of(Math.max(1, Math.min(limit, 50)))).stream().map(PlatformOwnerTransferStore::transfer).toList();
    }

    /** The live (unexpired, undecided) transfer naming this subject as the incoming owner, if any. */
    public Optional<Transfer> pendingFor(String incomingOwner, Instant now) {
        return transfers.findFirstByIncomingOwnerSubjectAndStatusInAndExpiresAtAfterOrderByInitiatedAtDesc(
                incomingOwner, PlatformOwnerTransferRepository.LIVE, micros(now)).map(PlatformOwnerTransferStore::transfer);
    }

    /** Withdrawn by the current owner, declined by the incoming owner, or refused by the verifier: the transfer ends. */
    public Transfer reject(Transfer transfer, String actor, String action, String reason) {
        if (transfers.advance(transfer.id(), transfer.revision(), PlatformOwnerTransferRepository.LIVE, "REJECTED") != 1) stale();
        audit.record(actor, transfer.id().toString(), action, "SUCCESS", reason);
        return forUpdate(transfer.id());
    }

    private static Transfer transfer(PlatformOwnerTransfer t) {
        return new Transfer(t.getId(), t.getCurrentOwnerSubject(), t.getIncomingOwnerSubject(), t.getStatus(), t.getInitiatedBy(),
                t.getReason(), t.getInitiatedAt(), t.getExpiresAt(), t.getRevision());
    }

    private static ApiException staleException() {
        return new ApiException(409, "STALE_OWNER_TRANSFER", "The owner transfer changed; reload and try again");
    }

    private static void stale() {
        throw staleException();
    }

    public record Transfer(UUID id, String currentOwner, String incomingOwner, String status, String initiatedBy,
                           String reason, Instant initiatedAt, Instant expiresAt, long revision) {}
}
