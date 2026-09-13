# Automation Coverage

- Backend integration/domain: passed; covers workflow transitions, RBAC, identity/account, documents, money, proposal, notifications, caching and idempotency.
- Frontend unit/component: 128/128 passed.
- Chromium browser regression: 152 passed, 12 credential-dependent tests skipped in that credential-free run.
- Gateway: 8/8 passed.
- Live Chromium: 3/3 passed when correctly serialized: coordinator→consultant→USD proposal→status→acknowledgement; activation→Keycloak password→sign-in→My Care→deposit; operations readiness gate→idempotent settlement.
- Cross-browser deterministic patient pack: Chromium functional assertions passed except two evidence-file write collisions; Firefox/WebKit blocked because their Playwright executables are absent.
- Manual/exploratory: exact assistive-technology behaviour, physical devices, signed-URL wall-clock expiry, near-limit large files and selected two-operator concurrency remain not run.

The first parallel live attempt is excluded from product verdicts: it generated expected shared-bucket 429s and cross-test Mailpit matching. Serialization produced 3/3 passes.
