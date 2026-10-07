package com.rehletshifaa.journey.application;

import com.rehletshifaa.casemanagement.infrastructure.CaseTaskRepository;
import com.rehletshifaa.journey.api.WorkDtos.PatientActionItemView;
import com.rehletshifaa.journey.api.WorkDtos.PatientActionView;
import com.rehletshifaa.journey.infrastructure.PatientActionItemRepository;
import com.rehletshifaa.shared.crypto.CryptoService;
import com.rehletshifaa.shared.crypto.EncryptedText;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * The read behind {@link PatientActionService}: the case's open information request as the patient (and the case page)
 * sees it. Two queries — the request, then its lines. Labels only; internal notes are never exposed. Authorization stays
 * with the caller.
 */
@Service
public class PatientActionQueryService {
    private final CaseTaskRepository tasks;
    private final PatientActionItemRepository items;
    private final CryptoService crypto;

    public PatientActionQueryService(CaseTaskRepository tasks, PatientActionItemRepository items, CryptoService crypto) {
        this.tasks = tasks; this.items = items; this.crypto = crypto;
    }

    /** The open request for this case, or null. */
    @Transactional(readOnly = true)
    public PatientActionView openAction(UUID caseId) {
        var task = tasks.findOpenPatientActionRowsOfType(caseId, PatientActionService.TASK_TYPE, Limit.of(1)).stream().findFirst().orElse(null);
        if (task == null) return null;
        var lines = items.findRowsOf(task.getId()).stream()
                .map(i -> new PatientActionItemView(i.getId(), i.getItemKind(), i.getItemCode(), decrypt(i.getLabel()),
                        Boolean.TRUE.equals(i.getRequired()), i.getCompletedAt() != null, decrypt(i.getResponseText())))
                .toList();
        return new PatientActionView(task.getId(), decrypt(task.getTitle()), decrypt(task.getDescription()),
                Boolean.TRUE.equals(task.getBlocking()), task.getDueAt(), lines);
    }

    private String decrypt(String value) { return EncryptedText.decodeNullable(crypto, value); }
}
