# Security, privacy, and production readiness

## Implemented controls

- Explicit consent is required and stored with the intake.
- Turnstile verification can be required in production.
- Case creation and document operations are rate limited.
- CORS is allow-listed; security headers are enabled.
- Documents use private, random object keys and short-lived presigned writes.
- Upload confirmation checks object existence, size, declared type, true file signature, quotas, and malware-scan result before staff download.
- S3 encryption supports AES-256 or a customer-managed KMS key.
- Logs and email notifications exclude medical narratives and direct identifiers.
- Database constraints and transactional services enforce state transitions.
- No anonymous case lookup exists. Authenticated downloads require object-level case authorization, clean status, short-lived URLs, and an audit event.
- OIDC roles are deny-by-default and combined with patient ownership or active assignment; sensitive clinical, finance, and patient decisions require recent authentication.
- Status, information-response, proposal, and activation link secrets are pepper-hashed, scoped, expiring, revocable, and replay-protected. OTPs are created on demand only after submission, never while a draft is uploading.
- Identity verification never mutates the operational/clinical case status.
- Released proposals are only reachable through a random, expiring, case-scoped link **plus** an OTP: the code is exchanged for a short-lived hashed view grant, and both viewing sensitive clinical/pricing detail and recording a decision require that grant. Possession of the URL plus a typed name is never accepted. Access codes and view grants are stored only as hashes; resend is rate-limited (5/hour), attempts are capped (5), and neutral errors avoid case enumeration.
- Proposal decisions are recorded against the exact released version; superseded, revoked, already-decided, and expired versions are rejected. There is no single-call create-and-release path.
- Secure-message thread membership and visibility are enforced server-side from a role→thread map; the client `internalOnly` flag is not trusted, and message reads are scoped to the actor's permitted threads.
- Account-activation invitations are sent only after acceptance, once per patient (unique constraint / idempotent), as pepper-hashed one-time tokens; activation links the existing profile and its cases and cannot undo the recorded acceptance.
- Notifications use a transactional outbox with bounded retries and dead-letter handling.
- OTP, secure-link, and activation payloads are encrypted inside the outbox; templates include only minimal wording and secure links, never clinical narrative or message bodies.
- Task titles/descriptions/evidence and secure-message bodies are encrypted at rest. Per-user read receipts prevent one staff member from marking a message read for everyone.
- Practitioner credentials are checked for status and expiry at assignment time, and an hourly expiry job removes practitioners whose verified credentials are no longer current from availability.
- Consents, assignment history, case transitions, proposal versions, and audit events are retained as append-oriented evidence.
- Secrets are environment supplied and example values are non-sensitive.

## Required before real patient use

1. Complete legal and privacy reviews for every operating jurisdiction; replace placeholder legal copy.
2. Perform a formal threat model, penetration test, dependency scan, and cloud-configuration review.
3. Configure production OIDC MFA/step-up policies, least-privilege role groups, joiner/mover/leaver automation, emergency access, and periodic access reviews.
4. Execute appropriate data-processing/health-data agreements with hosting, storage, email, analytics, and support vendors.
5. Define retention and deletion schedules, legal holds, subject-request handling, and secure disposal.
6. Enable encrypted backups, cross-account recovery where appropriate, and regularly test restoration.
7. Configure centralized metrics, sanitized alerts, audit trails, incident response, breach notification, and on-call ownership.
8. Operate ClamAV or an approved managed scanner with signature updates, health alerts, fail-closed behavior, quarantine review, and secure deletion.
9. Run the service only behind TLS, a WAF/CDN, network segmentation, managed secrets, and controlled administrative access.
10. Confirm that analytics/advertising consent and data flows match applicable law; avoid sending health-related events or free text.

## Data minimization

Collect only fields needed for coordination. Do not add medical narrative, patient contact data, filenames, or case identifiers to URLs, analytics, error trackers, email subjects, logs, or support tools. Any new integration must be assessed before receiving production traffic.

## Incident handling

Preserve sanitized operational logs, rotate suspected credentials, invalidate storage policies, isolate affected workloads, and follow the approved incident/breach process. Do not investigate incidents by copying patient data into chat or issue trackers.
