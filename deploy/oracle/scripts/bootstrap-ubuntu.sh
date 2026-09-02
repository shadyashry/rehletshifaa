#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this once with sudo: sudo bash deploy/oracle/scripts/bootstrap-ubuntu.sh" >&2
  exit 1
fi

operator="${SUDO_USER:-ubuntu}"
if ! id "${operator}" >/dev/null 2>&1; then
  echo "Operator account '${operator}' does not exist." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git openssl ufw unattended-upgrades docker.io docker-compose-v2

systemctl enable --now docker
usermod -aG docker "${operator}"

ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

install -d -m 0750 -o "${operator}" -g "${operator}" /opt/rehletshifaa
install -d -m 0750 -o "${operator}" -g "${operator}" /var/backups/rehletshifaa
install -d -m 0750 -o root -g "${operator}" /etc/rehletshifaa

echo "Host preparation complete. Sign out and back in so Docker group membership takes effect."

