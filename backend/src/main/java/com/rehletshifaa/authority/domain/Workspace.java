package com.rehletshifaa.authority.domain;

/** Portal workspaces the frontend routes to; derived from effective roles, never from identity-provider roles. */
public enum Workspace { OWNER, CONTROL_CENTER, COORDINATION, OPERATIONS, FINANCE, CREDENTIALING, IDENTITY_REVIEW, JOURNEY_GOVERNANCE,
    SUPPORT, CONSULTANT, CLINIC_DELEGATE, PATIENT }
