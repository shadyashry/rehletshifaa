package com.rehletshifaa.notification.application;
public interface NotificationPort { void notifyNewCase(NewCaseNotification notification); record NewCaseNotification(String caseNumber, String patientName, String country, String whatsappNumber) {} }

