#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   scripts/set-status.sh <state> [task]
# Example:
#   scripts/set-status.sh sprint "MSU1: Upload page + API store audio"

STATE="${1:-}"
TASK="${2:-}"

if [[ -z "$STATE" ]]; then
  echo "state is required" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATUS_FILE="$ROOT_DIR/STATUS.json"

UPDATED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

if [[ -z "$TASK" ]]; then
  TASK_JSON="null"
else
  # naive JSON string escape for quotes/backslashes
  TASK_ESCAPED="${TASK//\\/\\\\}"
  TASK_ESCAPED="${TASK_ESCAPED//\"/\\\"}"
  TASK_JSON="\"$TASK_ESCAPED\""
fi

cat > "$STATUS_FILE" <<EOF
{
  "state": "${STATE}",
  "task": ${TASK_JSON},
  "updatedAt": "${UPDATED_AT}"
}
EOF

echo "Updated $STATUS_FILE" >&2
