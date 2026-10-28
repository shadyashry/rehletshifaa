package com.rehletshifaa.journey.application;
import java.util.UUID;
/** B-4-1: whether the case's current statement still lacks its e-invoice reference; settlement owns the statement. */
public interface EInvoiceReader { boolean eInvoiceOwed(UUID caseId); }
