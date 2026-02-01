# meeting-hub — Backlog

## Principles
- **MSU (Minimum Shippable Unit)**: user-visible, shippable, build+lint green, 1 final commit.
- Night N1 cadence (90m) + morning summary.
- Prefer **local** work; use OpenAI only for summary/Q&A.

## TODO (P0)
- [x] MSU1: Upload page + API to store audio file on disk (no processing yet)
  - AC: upload m4a/wav; creates Meeting row; stores file under `data/audio/<meetingId>/...`
- [x] MSU2: Transcription worker v0 (local faster-whisper) + status updates
  - AC: click "Transcribe" starts; status transitions; transcript saved; no diarization

- [ ] LongAudio MSU1: Chunk long audio with ffmpeg (120s segments)
  - AC:
    - On transcribe start, create `data/audio/<meetingId>/chunks/` and split into ~120s chunks.
    - Record `totalChunks`.

- [ ] LongAudio MSU2: Transcribe chunks + stitch transcript
  - AC:
    - Transcribe each chunk independently.
    - Persist per-chunk transcript and final stitched `Meeting.transcriptText`.

- [ ] LongAudio MSU3: Progress heartbeat + UI progress
  - AC:
    - Persist `doneChunks`, `heartbeatAt`, `lastError`.
    - UI shows `done/total` and last heartbeat; no more "looks stuck".

- [ ] LongAudio MSU4: Queue + idempotent transcribe enqueue
  - AC:
    - Repeated clicks do not start duplicate workers.
    - Worker is resumable.

## TODO (P1)
- [ ] MSU6: OpenAI Audio API fallback for transcription (toggle)

## DONE
- [x] MSU7: Production deploy (systemd service) on port 3001 + basic hardening
- [x] MSU5: Retrieval v0 for Q&A (keyword/FTS) + citations (optional)
- [x] Repo created + Next.js scaffold + Password Gate + SQLite/Prisma init
- [x] MSU3: Summarize with OpenAI (Chinese) + store summary
  - AC: summary sections: Decisions/Action Items/Risks/Key Topics/Glossary
- [x] MSU4: Meeting page `/meetings/:id` two-panel UI
  - Left: summary (markdown)
  - Right: Q&A panel (store Q/A history)
