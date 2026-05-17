#!/usr/bin/env bash
# Publish site/ to IONOS staging via SFTP.
# Requires .env.deploy.local to be populated (see .env.deploy.example).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.deploy.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: $ENV_FILE not found. Copy .env.deploy.example to .env.deploy.local and fill it in." >&2
  exit 1
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

for var in IONOS_SFTP_HOST IONOS_SFTP_USER IONOS_SFTP_PASSWORD IONOS_SFTP_PORT IONOS_STAGING_REMOTE_PATH; do
  if [[ -z "${!var:-}" ]]; then
    echo "Error: $var is not set in .env.deploy.local" >&2
    exit 1
  fi
done

echo "Mirroring site/ → staging: $IONOS_STAGING_REMOTE_PATH"

lftp <<LFTP_SCRIPT
set cmd:fail-exit yes
set net:max-retries 2
set net:timeout 20
set sftp:auto-confirm yes
open -u "$IONOS_SFTP_USER","$IONOS_SFTP_PASSWORD" "sftp://$IONOS_SFTP_HOST:$IONOS_SFTP_PORT"
mirror --reverse --delete --verbose --exclude-glob .DS_Store "$REPO_ROOT/site/" "$IONOS_STAGING_REMOTE_PATH"
bye
LFTP_SCRIPT

echo "Done."
