#!/usr/bin/env bash
# P1-9: export the realm's configuration (realm settings, clients, roles, groups, authentication flows, required
# actions) through the admin REST partial export. Runs inside a Keycloak image, either the nightly sidecar
# (docker-compose.backup.yml) or `docker exec -i <keycloak> bash -s < export-realm.sh` from scripts/backup-set.sh.
#
# What is never in the file: users, their credentials and second factors (they live in Keycloak's database, which is
# recovered with the database, see docs/disaster-recovery.md), and client secrets / SMTP passwords / private keys,
# which Keycloak masks as "**********" in a partial export. The guards below refuse to write a file that breaks this.
#
# Environment:
#   KC_SERVER          admin endpoint (default http://localhost:8080, i.e. the container itself)
#   KC_ADMIN_USER      admin account with manage-realm on the realm (default: the container's bootstrap admin)
#   KC_ADMIN_PASSWORD  its password (default: the container's bootstrap admin password); never pass it on a command line
#   KC_EXPORT_REALM    realm to export (default rehletshifaa)
#   EXPORT_DIR         write <realm>-realm-<UTC timestamp>.json (+ .sha256) there and keep EXPORT_KEEP files;
#                      unset = write the JSON to stdout
#   EXPORT_KEEP        how many exports to keep in EXPORT_DIR (default 30)
set -Eeuo pipefail
umask 077

server="${KC_SERVER:-http://localhost:8080}"
user="${KC_ADMIN_USER:-${KC_BOOTSTRAP_ADMIN_USERNAME:-}}"
password="${KC_ADMIN_PASSWORD:-${KC_BOOTSTRAP_ADMIN_PASSWORD:-}}"
realm="${KC_EXPORT_REALM:-rehletshifaa}"
kcadm=/opt/keycloak/bin/kcadm.sh
[[ -n "${user}" && -n "${password}" ]] || { echo "export-realm: no admin credentials in the environment" >&2; exit 2; }

work="$(mktemp -d)"
trap 'rm -rf -- "${work}"' EXIT
config="${work}/kcadm.config"

# The password comes from the environment (the secret store in production), never from a file or the repository.
"${kcadm}" config credentials --config "${config}" --server "${server}" --realm master \
  --user "${user}" --password "${password}" >/dev/null
"${kcadm}" create "realms/${realm}/partial-export?exportClients=true&exportGroupsAndRoles=true" \
  --config "${config}" -o > "${work}/realm.json"

# Guards: a realm, no users or credentials, every secret-bearing field masked.
grep -q "\"realm\" : \"${realm}\"" "${work}/realm.json" || { echo "export-realm: export is not realm ${realm}" >&2; exit 3; }
# The only users a partial export carries are client service accounts (they hold the clients' role mappings); a
# person's account or any stored credential (`"credentials" : [`) means the export is wrong.
people=$(( $(grep -c '"username" :' "${work}/realm.json" || true) - $(grep -c '"serviceAccountClientId" :' "${work}/realm.json" || true) ))
if (( people != 0 )) || grep -Eq '"(credentials|federatedUsers)" : \[' "${work}/realm.json"; then
  echo "export-realm: export contains user accounts or credentials; refusing to write it" >&2; exit 3
fi
if grep -E '"(secret|password|privateKey|clientSecret)" : "' "${work}/realm.json" | grep -vq '\*\*\*\*\*\*\*\*\*\*'; then
  echo "export-realm: an unmasked secret is in the export; refusing to write it" >&2; exit 3
fi

if [[ -z "${EXPORT_DIR:-}" ]]; then
  cat "${work}/realm.json"
  exit 0
fi

mkdir -p "${EXPORT_DIR}"
name="${realm}-realm-$(date -u +%Y%m%dT%H%M%SZ).json"
cp "${work}/realm.json" "${EXPORT_DIR}/${name}.part"
mv "${EXPORT_DIR}/${name}.part" "${EXPORT_DIR}/${name}"
(cd "${EXPORT_DIR}" && sha256sum "${name}" > "${name}.sha256")
keep="${EXPORT_KEEP:-30}"
# Oldest first; names sort by timestamp.
ls -1 "${EXPORT_DIR}" | grep -E "^${realm}-realm-[0-9TZ]+\.json$" | head -n "-${keep}" | while read -r old; do
  rm -f -- "${EXPORT_DIR}/${old}" "${EXPORT_DIR}/${old}.sha256"
done
echo "export-realm: wrote ${EXPORT_DIR}/${name}"
