#!/usr/bin/env bash
# Polls <app-url>/healthz until it reports the expected commit SHA (Render's RENDER_GIT_COMMIT).
# Usage: scripts/wait-for-deploy.sh https://your-app.onrender.com <sha>
set -euo pipefail

URL="${1:?app url required}"
SHA="${2:?commit sha required}"
ATTEMPTS="${ATTEMPTS:-60}"   # 60 x 10s = 10 minutes (free instances build slowly and may be asleep)

for i in $(seq 1 "$ATTEMPTS"); do
  body="$(curl -fsS --max-time 30 "$URL/healthz" || true)"
  if grep -q "\"commit\":\"$SHA\"" <<<"$body"; then
    echo "Deployed and live: $SHA"
    exit 0
  fi
  echo "[$i/$ATTEMPTS] not live yet (got: ${body:-no response}); retrying in 10s"
  sleep 10
done

echo "Timed out waiting for commit $SHA to go live at $URL" >&2
exit 1
