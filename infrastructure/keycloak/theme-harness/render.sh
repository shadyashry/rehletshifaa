#!/usr/bin/env bash
# Renders the RehletShifaa login theme against the real Keycloak templates, without a running Keycloak (UX area 7).
#
# The first run copies Keycloak's theme and FreeMarker jars out of the local image (`docker create` + `docker cp` on a
# container that is never started; no compose, no stack). Pages land in theme-harness/out/ (git-ignored); shoot them
# with `frontend/e2e/keycloak-theme.spec.ts` (KC_HARNESS_DIR=<this folder>/out).
#
#   bash infrastructure/keycloak/theme-harness/render.sh
set -euo pipefail
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'

HERE="$(cd "$(dirname "$0")" && pwd)"
# Keep in step with docker-compose.yml's Keycloak image; the cache is keyed by it.
KC_VERSION="${KC_VERSION:-26.7.3}"
FREEMARKER_VERSION="${FREEMARKER_VERSION:-2.3.32}"
IMAGE="quay.io/keycloak/keycloak:$KC_VERSION"
CACHE="$HERE/.cache"
LIB=/opt/keycloak/lib/lib/main

# The stamp is written only after both jars unpacked, so a failed extraction is retried, never rendered from.
if [ ! -f "$CACHE/.ok-$KC_VERSION" ]; then
  rm -rf "$CACHE"
  mkdir -p "$CACHE/themes" "$CACHE/vendor"
  cid="$(docker create "$IMAGE")"
  trap 'docker rm "$cid" >/dev/null' EXIT
  docker cp "$cid:$LIB/org.freemarker.freemarker-$FREEMARKER_VERSION.jar" "$CACHE/freemarker.jar"
  docker cp "$cid:$LIB/org.keycloak.keycloak-themes-$KC_VERSION.jar" "$CACHE/themes.jar"
  docker cp "$cid:$LIB/org.keycloak.keycloak-themes-vendor-$KC_VERSION.jar" "$CACHE/vendor.jar"
  (cd "$CACHE/themes" && unzip -qo ../themes.jar)
  (cd "$CACHE/vendor" && unzip -qo ../vendor.jar)
  touch "$CACHE/.ok-$KC_VERSION"
fi

# Relative paths: a Windows JDK cannot read the /c/... form Git Bash uses.
cd "$HERE"
rm -rf out
java -cp .cache/freemarker.jar Render.java .cache/themes .cache/vendor ../themes/rehletshifaa out
