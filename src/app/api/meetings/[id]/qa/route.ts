import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

async function loadMeeting(id: string) {
  return prisma.meeting.findUnique({
    where: { id },
    select: { id: true },
  });
}

async function readQuestion(req: Request) {
  const ct = (req.headers.get("content-type") || "").toLowerCase();

  // Preferred (UI): JSON
  if (ct.includes("application/json")) {
    const body = (await req.json().catch(() => null)) as null | { question?: unknown };
    return String(body?.question || "").trim();
  }

  // Convenient for scripts/curl: form-encoded or multipart
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    const form = await req.formData();
    return String(form.get("question") || form.get("q") || "").trim();
  }

  // Fallback: try JSON anyway
  const body = (await req.json().catch(() => null)) as null | { question?: unknown };
  return String(body?.question || "").trim();
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const meeting = await loadMeeting(id);
  if (!meeting) {
    return NextResponse.json({ error: "meeting not found" }, { status: 404 });
  }

  const threads = await prisma.qAThread.findMany({
    where: { meetingId: meeting.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, question: true, answerMd: true, createdAt: true },
  });

  return NextResponse.json({
    ok: true,
    threads: threads.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() })),
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const meeting = await loadMeeting(id);
  if (!meeting) {
    return NextResponse.json({ error: "meeting not found" }, { status: 404 });
  }

  const question = await readQuestion(req);
  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  // MSU4: store Q/A history. Answering comes later (retrieval/OpenAI in MSU5+).
  const thread = await prisma.qAThread.create({
    data: {
      meetingId: meeting.id,
      question,
      answerMd: "",
      // citations omitted for now (MSU5+)
    },
    select: { id: true, question: true, answerMd: true, createdAt: true },
  });

  return NextResponse.json({
    ok: true,
    thread: { ...thread, createdAt: thread.createdAt.toISOString() },
  });
}
