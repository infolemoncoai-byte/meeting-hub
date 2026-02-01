import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";

export const runtime = "nodejs";

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

  // Fail fast with a clear error if the audio file is missing on disk.
  try {
    const st = await fs.stat(absAudioPath);
    if (!st.isFile()) {
      return NextResponse.json({ error: "audio path is not a file" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "audio file not found on disk" }, { status: 400 });
  }

  // Kick off background worker (detached) so the API can return immediately.
  // The worker updates Meeting.status + transcriptText.
  const workerPath = path.join(process.cwd(), "scripts", "transcribe-worker.cjs");

  try {
    const child = spawn(process.execPath, [workerPath, meeting.id], {
      detached: true,
      stdio: "ignore",
      env: process.env,
      cwd: process.cwd(),
    });

    child.unref();

    return NextResponse.json({ ok: true }, { status: 202 });
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
        error: "failed to start transcription worker",
        detail: msg,
      },
      { status: 500 },
    );
  }
}
