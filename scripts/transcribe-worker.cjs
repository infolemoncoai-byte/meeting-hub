#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/*
  Background transcription worker.
  Usage: node scripts/transcribe-worker.cjs <meetingId>

  Runs faster-whisper transcription (via scripts/transcribe.py) and writes transcript back to DB.
  Optional OpenAI fallback (see README): MEETING_HUB_TRANSCRIBE_FALLBACK=1
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

function boolEnv(v) {
  if (!v) return false;
  const s = String(v).toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on" || s === "openai";
}

async function transcribeWithOpenAI(absPath) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_AUDIO_MODEL || "gpt-4o-mini-transcribe";

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const buf = await fs.readFile(absPath);
  const fd = new FormData();
  fd.append("model", model);
  fd.append("file", new Blob([buf]), path.basename(absPath));

  const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: fd,
  });

  const json = await resp.json().catch(() => null);
  if (!resp.ok) {
    const detail = json ? JSON.stringify(json).slice(0, 1500) : "(no body)";
    throw new Error(`OpenAI audio transcription failed (${resp.status}): ${detail}`);
  }

  if (!json || typeof json.text !== "string") {
    throw new Error("OpenAI audio transcription returned empty text");
  }

  return json.text.trim();
}

async function main() {
  const meetingId = process.argv[2];
  if (!meetingId) {
    console.error("meetingId is required");
    process.exit(2);
  }

  const prisma = new PrismaClient();
  const useOpenAIFallback = boolEnv(process.env.MEETING_HUB_TRANSCRIBE_FALLBACK);

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

    // LongAudio MSU2: split into ~120s chunks, transcribe per chunk, persist per-chunk transcript,
    // then stitch into Meeting.transcriptText.
    const absChunksDir = path.join(process.cwd(), "data", "audio", meeting.id, "chunks");

    async function ensureChunks() {
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

      const chunkNames = (await fs.readdir(absChunksDir))
        .filter((n) => n.toLowerCase().endsWith(".wav"))
        .sort();

      const totalChunks = chunkNames.length;
      if (totalChunks === 0) throw new Error("no chunks produced by ffmpeg");

      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { totalChunks },
        select: { id: true },
      });

      return chunkNames;
    }

    const venvPython = path.join(process.cwd(), ".venv", "bin", "python3");
    const python =
      process.env.MEETING_HUB_PYTHON ||
      (await fs
        .stat(venvPython)
        .then(() => venvPython)
        .catch(() => "python3"));

    let chunkNames;
    try {
      chunkNames = await ensureChunks();
    } catch (e) {
      // Fallback: if chunking fails, transcribe whole file to avoid complete failure.
      console.error(
        `transcribe-worker: chunking failed, falling back to whole-file transcription: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );

      try {
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

        console.error(`transcribe-worker: done (whole-file fallback) meeting=${meeting.id}`);
        return;
      } catch (localErr) {
        if (!useOpenAIFallback) throw localErr;

        console.error(
          `transcribe-worker: local whole-file failed, falling back to OpenAI audio: ${
            localErr instanceof Error ? localErr.message : String(localErr)
          }`,
        );

        const transcript = await transcribeWithOpenAI(absAudioPath);

        await prisma.meeting.update({
          where: { id: meeting.id },
          data: {
            status: "TRANSCRIBED",
            transcriptText: transcript || null,
          },
          select: { id: true },
        });

        console.error(`transcribe-worker: done (OpenAI whole-file fallback) meeting=${meeting.id}`);
        return;
      }
    }

    // Transcribe each chunk, persist per-chunk transcript in the chunks dir.
    const chunkTranscripts = [];

    for (const name of chunkNames) {
      const absChunkPath = path.join(absChunksDir, name);
      const absOutTxt = path.join(absChunksDir, `${name}.txt`);

      let t = "";
      try {
        const { stdout } = await execFileAsync(python, [scriptPath, absChunkPath]);
        t = stdout.trim();
      } catch (err) {
        if (!useOpenAIFallback) throw err;

        console.error(
          `transcribe-worker: local chunk failed, using OpenAI audio for ${name}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        t = await transcribeWithOpenAI(absChunkPath);
      }

      await fs.writeFile(absOutTxt, t ? `${t}\n` : "", "utf8");
      chunkTranscripts.push(t);
    }

    const stitched = chunkTranscripts
      .map((t) => t.trim())
      .filter(Boolean)
      .join("\n\n");

    await prisma.meeting.update({
      where: { id: meeting.id },
      data: {
        status: "TRANSCRIBED",
        transcriptText: stitched || null,
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
