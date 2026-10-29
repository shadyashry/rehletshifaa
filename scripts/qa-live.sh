#!/usr/bin/env bash
# Runs live Playwright specs against the isolated QA stack (docker-compose.qa.yml, project rehletshifaa-qa):
#
#   docker compose -p rehletshifaa-qa -f docker-compose.yml -f docker-compose.qa.yml up -d
#   scripts/qa-live.sh e2e/operations-gate-live.spec.ts [more specs or Playwright options]
#
# The seeded QA passwords are read from the realm file and exported without being printed. Authenticator secrets and
# the virtual passkey enrolled on the QA realm sit in frontend/.e2e/mfa while the run lasts and are parked in
# frontend/.e2e/mfa-qa afterwards (both git-ignored), so they never mix with the tunnel stack's frontend/.e2e/mfa-dev.
set -u
repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
realm="$repo/infrastructure/keycloak/realm-rehletshifaa.json"
fe="$repo/frontend"
pw() { node -e 'const r=require(process.argv[1]);const u=r.users.find(x=>x.username===process.argv[2]);process.stdout.write(u&&u.credentials&&u.credentials[0]?u.credentials[0].value:"")' "$realm" "$1"; }
export PORTAL_TEST_PASSWORD="$(pw coordinator)" DOCTOR_TEST_PASSWORD="$(pw doctor)" OPERATIONS_TEST_PASSWORD="$(pw operations)" FINANCE_TEST_PASSWORD="$(pw finance)" PATIENT_TEST_PASSWORD="$(pw patient)" ADMIN_TEST_PASSWORD="$(pw credential-admin)"
export PLAYWRIGHT_EXTERNAL_SERVER=true PLAYWRIGHT_BASE_URL=http://localhost:13000 PLAYWRIGHT_API_BASE_URL=http://localhost:18081
export PLAYWRIGHT_OIDC_AUTHORITY=http://localhost:18180/realms/rehletshifaa MAILPIT_URL=http://localhost:18025 PLAYWRIGHT_BACKEND_HEALTH_URL=http://localhost:18080/actuator/health
mkdir -p "$fe/.e2e"
# The QA folder carries a marker, so secrets left in mfa by an interrupted run are recognised and never filed as dev's.
if [ -d "$fe/.e2e/mfa" ] && [ ! -f "$fe/.e2e/mfa/.qa" ]; then
  [ -d "$fe/.e2e/mfa-dev" ] && { echo "qa-live: both frontend/.e2e/mfa and mfa-dev exist; sort them out by hand" >&2; exit 2; }
  mv "$fe/.e2e/mfa" "$fe/.e2e/mfa-dev"
fi
[ ! -d "$fe/.e2e/mfa" ] && [ -d "$fe/.e2e/mfa-qa" ] && mv "$fe/.e2e/mfa-qa" "$fe/.e2e/mfa"
mkdir -p "$fe/.e2e/mfa" && touch "$fe/.e2e/mfa/.qa"
park() { [ -d "$fe/.e2e/mfa" ] && [ ! -d "$fe/.e2e/mfa-qa" ] && mv "$fe/.e2e/mfa" "$fe/.e2e/mfa-qa"; }
trap park EXIT
cd "$fe" && npx playwright test --workers=1 --reporter=line "$@"
