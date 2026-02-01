import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!meeting) {
    return NextResponse.json({ error: "meeting not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as null | { question?: unknown };
  const question = String(body?.question || "").trim();

  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  // MSU4: store Q/A history. Answering comes later (retrieval/OpenAI in MSU5+).
  await prisma.qAThread.create({
    data: {
      meetingId: meeting.id,
      question,
      answerMd: "",
      // citations omitted for now (MSU5+)
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true });
}
