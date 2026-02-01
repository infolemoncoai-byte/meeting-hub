#!/usr/bin/env bash
set -euo pipefail

BASE_URL=${BASE_URL:-http://127.0.0.1:3001}
PASSWORD=${MEETING_HUB_PASSWORD:-}
AUDIO_FILE=${AUDIO_FILE:-}
TITLE=${TITLE:-"Smoke Test Meeting"}

if [[ -z "${PASSWORD}" ]]; then
  echo "MEETING_HUB_PASSWORD env missing" >&2
  exit 1
fi
if [[ -z "${AUDIO_FILE}" ]]; then
  echo "AUDIO_FILE env missing (path to .m4a or .wav)" >&2
  exit 1
fi

COOKIE_JAR=$(mktemp)
trap 'rm -f "${COOKIE_JAR}"' EXIT

# Login
curl -sS -L -c "${COOKIE_JAR}" -b "${COOKIE_JAR}" \
  -X POST "${BASE_URL}/api/login" \
  -F "password=${PASSWORD}" \
  >/dev/null

echo "Logged in."

# Upload
MEETING_ID=$(curl -sS -L -c "${COOKIE_JAR}" -b "${COOKIE_JAR}" \
  -X POST "${BASE_URL}/api/meetings/upload" \
  -F "title=${TITLE}" \
  -F "file=@${AUDIO_FILE}" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{try{console.log(JSON.parse(s).id)}catch(e){console.error(s);process.exit(1)}})')

echo "Uploaded meeting: ${MEETING_ID}"

echo "Now open: ${BASE_URL}/meetings/${MEETING_ID}"

echo "Trigger transcribe: POST ${BASE_URL}/api/meetings/${MEETING_ID}/transcribe"
echo "Trigger summarize:  POST ${BASE_URL}/api/meetings/${MEETING_ID}/summarize"
