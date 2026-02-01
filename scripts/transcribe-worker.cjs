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

    // LongAudio MSU1: pre-split audio into ~120s chunks (even though we still transcribe as a whole for now)
    const absChunksDir = path.join(process.cwd(), "data", "audio", meeting.id, "chunks");
    try {
      await fs.rm(absChunksDir, { recursive: true, force: true });
      await fs.mkdir(absChunksDir, { recursive: true });

      // Output WAV chunks for maximum compatibility with downstream transcription.
      // Note: -c copy is not reliable for all containers; re-encode to PCM.
      const outPattern = path.join(absChunksDir, "%03d.wav");
      await execFileAsync("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        absAudioPath,
        "-f",
        "segment",
        "-segment_time",
        "120",
        "-c:a",
        "pcm_s16le",
        outPattern,
      ]);

      const chunkNames = (await fs.readdir(absChunksDir)).filter((n) => n.toLowerCase().endsWith(".wav"));
      const totalChunks = chunkNames.length;

      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { totalChunks },
        select: { id: true },
      });
    } catch (e) {
      // Don't fail the whole transcription yet — chunking is a best-effort pre-step.
      console.error(`transcribe-worker: chunking failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    const venvPython = path.join(process.cwd(), ".venv", "bin", "python3");
    const python =
      process.env.MEETING_HUB_PYTHON ||
      (await fs
        .stat(venvPython)
        .then(() => venvPython)
        .catch(() => "python3"));

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
