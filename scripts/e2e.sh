#!/usr/bin/env bash
set -euo pipefail

# Full E2E for Meeting Hub (upload → transcribe → summarize → Q&A)
#
# Usage:
#   sudo -E BASE_URL=http://127.0.0.1:3001 AUDIO_FILE=/path/to/file.m4a scripts/e2e.sh
#
# If MEETING_HUB_PASSWORD is not in env, this script will try to source:
#   /etc/meeting-hub/meeting-hub.env (requires root)

BASE_URL=${BASE_URL:-http://127.0.0.1:3001}
AUDIO_FILE=${AUDIO_FILE:-}
TITLE=${TITLE:-"E2E Test Meeting"}
QUESTION=${QUESTION:-"有哪些 action items?"}

if [[ -z "${AUDIO_FILE}" ]]; then
  echo "AUDIO_FILE env missing (path to .m4a or .wav)" >&2
  exit 1
fi
if [[ ! -f "${AUDIO_FILE}" ]]; then
  echo "AUDIO_FILE not found: ${AUDIO_FILE}" >&2
  exit 1
fi

# Load password from /etc when running on prod box.
if [[ -z "${MEETING_HUB_PASSWORD:-}" ]]; then
  if [[ -f /etc/meeting-hub/meeting-hub.env ]]; then
    # shellcheck disable=SC1091
    set -a
    source /etc/meeting-hub/meeting-hub.env
    set +a
  fi
fi

PASSWORD=${MEETING_HUB_PASSWORD:-}
if [[ -z "${PASSWORD}" ]]; then
  echo "MEETING_HUB_PASSWORD missing (set env or ensure /etc/meeting-hub/meeting-hub.env exists)" >&2
  exit 1
fi

COOKIE_JAR=$(mktemp)
trap 'rm -f "${COOKIE_JAR}"' EXIT

json_ok() {
  node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{try{const j=JSON.parse(s); if(!j.ok){console.error(j); process.exit(1)}; console.log("OK") }catch(e){console.error(s); process.exit(1)}})'
}

json_get() {
  local key=$1
  node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{const j=JSON.parse(s); const v=j['${key}']; if(v===undefined){console.error('missing key: ${key}'); console.error(j); process.exit(1)}; console.log(v)}catch(e){console.error(s); process.exit(1)}})"
}

# 1) Login
curl -sS -c "${COOKIE_JAR}" -b "${COOKIE_JAR}" \
  -X POST "${BASE_URL}/api/login" \
  -H "Accept: application/json" \
  -H "x-meeting-hub-client: script" \
  -F "password=${PASSWORD}" \
  | json_ok >/dev/null

echo "Logged in."

# 2) Upload
MEETING_ID=$(curl -sS -L -c "${COOKIE_JAR}" -b "${COOKIE_JAR}" \
  -X POST "${BASE_URL}/api/meetings/upload" \
  -F "title=${TITLE}" \
  -F "file=@${AUDIO_FILE}" \
  | json_get id)

echo "Uploaded meeting: ${MEETING_ID}"

echo "Open: ${BASE_URL}/meetings/${MEETING_ID}"

# Helper to fetch status
get_status() {
  curl -sS -c "${COOKIE_JAR}" -b "${COOKIE_JAR}" \
    "${BASE_URL}/api/meetings/${MEETING_ID}/status"
}

# 3) Transcribe
curl -sS -c "${COOKIE_JAR}" -b "${COOKIE_JAR}" \
  -X POST "${BASE_URL}/api/meetings/${MEETING_ID}/transcribe" \
  -H "Accept: application/json" \
  | cat >/dev/null

echo "Triggered transcribe. Waiting for TRANSCRIBED..."

for i in $(seq 1 120); do
  st_json=$(get_status)
  st=$(printf "%s" "${st_json}" | json_get status)
  if [[ "${st}" == "FAILED" ]]; then
    echo "Transcribe FAILED: ${st_json}" >&2
    exit 1
  fi
  if [[ "${st}" == "TRANSCRIBED" || "${st}" == "READY" ]]; then
    echo "Transcribe done: ${st}"
    break
  fi
  if (( i % 10 == 0 )); then
    echo "  status=${st} (t+${i}s)"
  fi
  sleep 1
  if [[ ${i} -eq 120 ]]; then
    echo "Timed out waiting for TRANSCRIBED. Last: ${st_json}" >&2
    exit 1
  fi
done

# 4) Summarize
curl -sS -c "${COOKIE_JAR}" -b "${COOKIE_JAR}" \
  -X POST "${BASE_URL}/api/meetings/${MEETING_ID}/summarize" \
  -H "Accept: application/json" \
  | cat >/dev/null

echo "Triggered summarize. Waiting for READY..."

for i in $(seq 1 120); do
  st_json=$(get_status)
  st=$(printf "%s" "${st_json}" | json_get status)
  if [[ "${st}" == "FAILED" ]]; then
    echo "Summarize FAILED: ${st_json}" >&2
    exit 1
  fi
  if [[ "${st}" == "READY" ]]; then
    echo "Summarize done: ${st}"
    break
  fi
  if (( i % 10 == 0 )); then
    echo "  status=${st} (t+${i}s)"
  fi
  sleep 1
  if [[ ${i} -eq 120 ]]; then
    echo "Timed out waiting for READY. Last: ${st_json}" >&2
    exit 1
  fi
done

# 5) Q&A
QA_PAYLOAD=$(QUESTION="${QUESTION}" node -e 'console.log(JSON.stringify({question: process.env.QUESTION || ""}))')
QA_JSON=$(curl -sS -c "${COOKIE_JAR}" -b "${COOKIE_JAR}" \
  -X POST "${BASE_URL}/api/meetings/${MEETING_ID}/qa" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  --data "${QA_PAYLOAD}")

QA_OK=$(printf "%s" "${QA_JSON}" | json_get ok)
if [[ "${QA_OK}" != "true" ]]; then
  echo "QA failed: ${QA_JSON}" >&2
  exit 1
fi

echo "Q&A ok."

echo "E2E PASS: ${BASE_URL}/meetings/${MEETING_ID}"
