import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      transcriptText: true,
      summaryMd: true,
      totalChunks: true,
      updatedAt: true,
    },
  });

  if (!meeting) {
    return NextResponse.json({ error: "meeting not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: meeting.id,
    status: meeting.status,
    hasTranscript: Boolean(meeting.transcriptText),
    hasSummary: Boolean(meeting.summaryMd),
    totalChunks: meeting.totalChunks ?? null,
    updatedAt: meeting.updatedAt.toISOString(),
  });
}
