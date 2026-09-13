# Execution Evidence Log

Date: 2026-09-12 (Asia/Dubai)

- Docker tunnel stack: all required services up; gateway, ClamAV, Mailpit and MinIO reported healthy.
- Backend: `mvn -o -q test` — exit 0; 30 Flyway migrations validated/applied in test context.
- Frontend typecheck: `pnpm typecheck` — exit 0.
- Frontend Vitest: 13 files, 128 tests — all passed.
- Chromium Playwright regression: 164 discovered, 152 passed, 12 credential-dependent skipped — exit 0.
- Gateway focused run: 8/8 passed.
- Live serial run: 3/3 passed in 4.0 minutes.
- Cross-browser pack: Firefox/WebKit blocked before launch; Chromium assertions green except two fixed-path evidence write errors.
- Initial parallel live run: excluded from product verdict; 8 gateway passed, three live flows false-failed from shared rate/mail resources; serial rerun passed.

Sensitive values, OTPs and patient data are intentionally omitted. All created identities were synthetic and uniquely timestamped.
