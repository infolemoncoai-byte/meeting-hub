import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import path from "node:path";
import fs from "node:fs/promises";

export const runtime = "nodejs";

const MAX_BYTES = 250 * 1024 * 1024; // 250MB (local dev)

function sanitizeFilename(name: string) {
  // keep it simple: remove path separators and odd chars
  const base = name.replace(/\\/g, "/").split("/").pop() || "audio";
  return base.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const title = String(form.get("title") || "").trim();
    const file = form.get("file");

    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (!file.name) {
      return NextResponse.json({ error: "file name missing" }, { status: 400 });
    }
    if (file.size <= 0) {
      return NextResponse.json({ error: "empty file" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `file too large (> ${MAX_BYTES} bytes)` }, { status: 413 });
    }

    const ext = path.extname(file.name).toLowerCase();
    if (!(ext === ".m4a" || ext === ".wav")) {
      return NextResponse.json({ error: "only .m4a or .wav are allowed" }, { status: 400 });
    }

    // Create meeting first so we have the ID for path
    const meeting = await prisma.meeting.create({
      data: {
        title,
        source: "upload",
        status: "UPLOADED",
      },
      select: { id: true },
    });

    const safeName = sanitizeFilename(file.name);
    const relPath = path.join("data", "audio", meeting.id, safeName);
    const absPath = path.join(process.cwd(), relPath);

    await fs.mkdir(path.dirname(absPath), { recursive: true });

    const arrayBuffer = await file.arrayBuffer();
    await fs.writeFile(absPath, Buffer.from(arrayBuffer));

    await prisma.meeting.update({
      where: { id: meeting.id },
      data: { audioPath: relPath },
      select: { id: true },
    });

    return NextResponse.json({ id: meeting.id });
  } catch (err) {
    console.error("upload failed", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "unknown error" }, { status: 500 });
  }
}
