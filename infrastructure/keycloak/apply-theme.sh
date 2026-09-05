#!/usr/bin/env bash
# Idempotent, non-destructive activation of the RehletShifaa login theme on an
# ALREADY-PERSISTED realm.
#
# Why this exists: `--import-realm` only seeds a realm the first time; it does NOT
# re-apply realm settings (loginTheme, i18n) once the realm exists in the
# keycloak-data volume. Fresh imports pick the theme up from realm-*.json; existing
# realms need this one-shot admin update. Running it repeatedly is safe — it sets
# the same values every time and never deletes anything (the volume is untouched).
#
# Usage (local stack; container name defaults to the compose service "keycloak"):
#   bash infrastructure/keycloak/apply-theme.sh
#   KC_CONTAINER=<name> KC_ADMIN=admin KC_ADMIN_PASSWORD=Admin123! bash infrastructure/keycloak/apply-theme.sh
set -euo pipefail

# Stop Git Bash / MSYS on Windows from rewriting in-container absolute paths
# (e.g. /opt/keycloak/...) into host paths. Harmless on Linux/macOS.
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'

KC_CONTAINER="${KC_CONTAINER:-keycloak}"
KC_ADMIN="${KC_ADMIN:-admin}"
KC_ADMIN_PASSWORD="${KC_ADMIN_PASSWORD:-Admin123!}"
REALM="${REALM:-rehletshifaa}"
THEME="${THEME:-rehletshifaa}"

# Resolve the running container if the plain service name isn't the container name.
if ! docker inspect "$KC_CONTAINER" >/dev/null 2>&1; then
  KC_CONTAINER="$(docker ps --filter 'ancestor=quay.io/keycloak/keycloak:26.7.3' --format '{{.Names}}' | head -n1)"
fi
if [ -z "$KC_CONTAINER" ]; then
  echo "ERROR: could not find a running Keycloak container. Is the stack up?" >&2
  exit 1
fi
echo "Using Keycloak container: $KC_CONTAINER"

kcadm() { docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh "$@"; }

kcadm config credentials --server http://localhost:8080 \
  --realm master --user "$KC_ADMIN" --password "$KC_ADMIN_PASSWORD"

kcadm update "realms/$REALM" \
  -s "loginTheme=$THEME" \
  -s "internationalizationEnabled=true" \
  -s 'supportedLocales=["en","ar"]' \
  -s "defaultLocale=en"

echo "Applied loginTheme='$THEME' + EN/AR i18n to realm '$REALM'. Reload the login page (theme cache is off in dev)."
