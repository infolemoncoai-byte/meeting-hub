# Meeting Hub — E2E verification checklist

Use this after deploy (or locally) to confirm the full flow.

## 0) Preconditions
- Service running (prod) or `npm run dev` (local)
- Env vars present:
  - `MEETING_HUB_PASSWORD`
  - `SESSION_PASSWORD`
  - `DATABASE_URL`
  - `OPENAI_API_KEY` (only needed for Summarize)

## 1) Login gate
- Open `/login`
- Enter `MEETING_HUB_PASSWORD`
- Confirm redirect to `/` or `/upload`

## 2) Upload
- Go to `/upload`
- Upload a small `.m4a` or `.wav`
- Expect: redirect to `/meetings/:id`
- Verify files exist:
  - `data/audio/<meetingId>/...`

## 3) Transcribe
- On `/meetings/:id`, click **Transcribe**
- Expect status transitions (UI) until complete
- Verify outputs (paths may vary by implementation):
  - transcript stored in DB and/or under `data/...`

## 4) Summarize (OpenAI)
- Click **Summarize**
- Expect markdown summary with sections:
  - Decisions / Action Items / Risks / Key Topics / Glossary

## 5) Q&A
- Ask a question referencing the meeting (e.g. “有哪些 action items?”)
- Expect an answer + Q/A history persists on refresh

## 6) Restart persistence
- Restart server/service
- Refresh `/meetings/:id`
- Confirm: summary + transcript + Q/A history still present

## 7) Production service checks (if systemd)
- `systemctl status meeting-hub --no-pager`
- `journalctl -u meeting-hub -n 200 --no-pager`
- Confirm listening on 3001:
  - `ss -ltnp | grep 3001`
