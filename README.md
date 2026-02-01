# Meeting Hub

Local-first meeting workflow:
1) Upload audio (.m4a/.wav) → creates a Meeting row + stores file on disk
2) Transcribe locally (faster-whisper, no diarization yet)

## Requirements
- Node.js
- Python 3 (for local transcription)

## Setup (dev)

```bash
cp .env.example .env
# set MEETING_HUB_PASSWORD + SESSION_PASSWORD

npm install

# Prisma / SQLite
npx prisma generate
npx prisma migrate dev --name init

PORT=3001 npm run dev
```

Open: http://localhost:3001

## Transcription (MSU2)

Install the local transcriber dependency:

```bash
python3 -m pip install --upgrade pip
python3 -m pip install faster-whisper
```

Then:
- Upload an audio file at `/upload`
- Go to the meeting page and click **Transcribe**

Notes:
- Transcript is stored in `Meeting.transcriptText` in SQLite.
- The audio file is stored under `data/audio/<meetingId>/...`
