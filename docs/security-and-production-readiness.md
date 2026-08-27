# Security, privacy, and production readiness

## Implemented controls

- Explicit consent is required and stored with the intake.
- Turnstile verification can be required in production.
- Case creation and document operations are rate limited.
- CORS is allow-listed; security headers are enabled.
- Documents use private, random object keys and short-lived presigned writes.
- Upload confirmation checks object existence, size, and media type.
- S3 encryption supports AES-256 or a customer-managed KMS key.
- Logs and email notifications exclude medical narratives and direct identifiers.
- Database constraints and transactional services enforce state transitions.
- No anonymous case lookup or download endpoint exists.
- Secrets are environment supplied and example values are non-sensitive.

## Required before real patient use

1. Complete legal and privacy reviews for every operating jurisdiction; replace placeholder legal copy.
2. Perform a formal threat model, penetration test, dependency scan, and cloud-configuration review.
3. Establish identity, MFA, least-privilege staff access, joiner/mover/leaver, and periodic access-review procedures.
4. Execute appropriate data-processing/health-data agreements with hosting, storage, email, analytics, and support vendors.
5. Define retention and deletion schedules, legal holds, subject-request handling, and secure disposal.
6. Enable encrypted backups, cross-account recovery where appropriate, and regularly test restoration.
7. Configure centralized metrics, sanitized alerts, audit trails, incident response, breach notification, and on-call ownership.
8. Configure malware scanning/quarantine for uploaded documents before staff access.
9. Run the service only behind TLS, a WAF/CDN, network segmentation, managed secrets, and controlled administrative access.
10. Confirm that analytics/advertising consent and data flows match applicable law; avoid sending health-related events or free text.

## Data minimization

Collect only fields needed for coordination. Do not add medical narrative, patient contact data, filenames, or case identifiers to URLs, analytics, error trackers, email subjects, logs, or support tools. Any new integration must be assessed before receiving production traffic.

## Incident handling

Preserve sanitized operational logs, rotate suspected credentials, invalidate storage policies, isolate affected workloads, and follow the approved incident/breach process. Do not investigate incidents by copying patient data into chat or issue trackers.

