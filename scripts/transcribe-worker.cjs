#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/*
  Background transcription worker.
  Usage: node scripts/transcribe-worker.cjs <meetingId>

  Runs faster-whisper transcription (via scripts/transcribe.py) and writes transcript back to DB.
*/

const path = require("node:path");
const fs = require("node:fs/promises");
const { execFile } = require("node:child_process");
const { PrismaClient } = require("@prisma/client");

function execFileAsync(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const e = new Error(`${err.message}\n${stderr}`.trim());
        e.cause = err;
        reject(e);
        return;
      }
      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

async function main() {
  const meetingId = process.argv[2];
  if (!meetingId) {
    console.error("meetingId is required");
    process.exit(2);
  }

  const prisma = new PrismaClient();

  try {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { id: true, status: true, audioPath: true },
    });

    if (!meeting) throw new Error("meeting not found");
    if (!meeting.audioPath) throw new Error("meeting has no audioPath");

    // If status changed since API kick-off, don't fight it.
    if (meeting.status !== "TRANSCRIBING") {
      throw new Error(`expected status TRANSCRIBING but got ${meeting.status}`);
    }

    const absAudioPath = path.join(process.cwd(), meeting.audioPath);
    const scriptPath = path.join(process.cwd(), "scripts", "transcribe.py");

    // validate input file exists
    const st = await fs.stat(absAudioPath);
    if (!st.isFile()) throw new Error("audio path is not a file");

    const venvPython = path.join(process.cwd(), ".venv", "bin", "python3");
    const python = process.env.MEETING_HUB_PYTHON || (await fs.stat(venvPython).then(() => venvPython).catch(() => "python3"));

    const { stdout } = await execFileAsync(python, [scriptPath, absAudioPath]);
    const transcript = stdout.trim();

    await prisma.meeting.update({
      where: { id: meeting.id },
      data: {
        status: "TRANSCRIBED",
        transcriptText: transcript || null,
      },
      select: { id: true },
    });

    console.error(`transcribe-worker: done meeting=${meeting.id}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`transcribe-worker: failed: ${msg}`);

    // best-effort: mark FAILED
    try {
      const prisma2 = new PrismaClient();
      await prisma2.meeting.update({
        where: { id: meetingId },
        data: { status: "FAILED", transcriptText: null },
        select: { id: true },
      });
      await prisma2.$disconnect();
    } catch {
      // ignore
    }

    process.exitCode = 1;
  } finally {
    try {
      await prisma.$disconnect();
    } catch {
      // ignore
    }
  }
}

main();
