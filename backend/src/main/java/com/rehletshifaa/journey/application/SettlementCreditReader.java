package com.rehletshifaa.journey.application;
import java.math.BigDecimal;
import java.util.UUID;
/** Current unused settlement credit; settlement owns the statement and adjusts for later refunds. */
public interface SettlementCreditReader { BigDecimal currentCreditDue(UUID caseId); }
