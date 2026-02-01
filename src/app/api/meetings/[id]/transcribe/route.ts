import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";

export const runtime = "nodejs";

function execFileAsync(cmd: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const e = new Error(`${err.message}\n${stderr}`.trim());
        (e as { cause?: unknown }).cause = err;
        reject(e);
        return;
      }
      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { id: true, status: true, audioPath: true },
  });

  if (!meeting) {
    return NextResponse.json({ error: "meeting not found" }, { status: 404 });
  }
  if (!meeting.audioPath) {
    return NextResponse.json({ error: "meeting has no audioPath" }, { status: 400 });
  }

  // Only allow from a small set of states.
  if (!(meeting.status === "UPLOADED" || meeting.status === "FAILED")) {
    return NextResponse.json(
      { error: `cannot transcribe when status=${meeting.status}` },
      { status: 409 },
    );
  }

  // mark TRANSCRIBING first so UI can reflect progress
  await prisma.meeting.update({
    where: { id: meeting.id },
    data: { status: "TRANSCRIBING", transcriptText: null },
    select: { id: true },
  });

  const absAudioPath = path.join(process.cwd(), meeting.audioPath);
  const scriptPath = path.join(process.cwd(), "scripts", "transcribe.py");

  // Fail fast with a clear error if the audio file is missing on disk.
  try {
    const st = await fs.stat(absAudioPath);
    if (!st.isFile()) {
      return NextResponse.json({ error: "audio path is not a file" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "audio file not found on disk" }, { status: 400 });
  }

  const python = process.env.MEETING_HUB_PYTHON || "python3";

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

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    await prisma.meeting.update({
      where: { id: meeting.id },
      data: {
        status: "FAILED",
        transcriptText: null,
      },
      select: { id: true },
    });

    return NextResponse.json(
      {
        error: "transcription failed",
        detail: msg,
        hint: "Install faster-whisper (see scripts/transcribe.py) or adjust the transcriber implementation.",
      },
      { status: 500 },
    );
  }
}
