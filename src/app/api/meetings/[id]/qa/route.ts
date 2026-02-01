import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

async function loadMeeting(id: string) {
  return prisma.meeting.findUnique({
    where: { id },
    select: { id: true, transcriptText: true, summaryMd: true },
  });
}

function tokenize(q: string) {
  return q
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => t.length >= 2)
    .filter((t) => !STOPWORDS.has(t));
}

const STOPWORDS = new Set([
  // tiny bilingual-ish list; keep small and safe
  "the",
  "a",
  "an",
  "and",
  "or",
  "to",
  "of",
  "in",
  "on",
  "for",
  "with",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "it",
  "this",
  "that",
  "we",
  "i",
  "you",
  "they",
  "he",
  "she",
  "as",
  "at",
  "by",
  "from",
]);

function scoreText(text: string, tokens: string[]) {
  const lower = text.toLowerCase();
  let s = 0;
  for (const t of tokens) {
    if (lower.includes(t)) s += 1;
  }
  return s;
}

function splitIntoChunks(text: string) {
  // Prefer paragraph split; fall back to line split.
  const paras = text
    .split(/\n\s*\n/g)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paras.length >= 2) return paras;

  return text
    .split(/\n/g)
    .map((p) => p.trim())
    .filter(Boolean);
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

  // MSU5 (v0): local retrieval from transcript/summary (no OpenAI)
  const tokens = tokenize(question);

  const citations: Array<{ source: "transcript" | "summary"; text: string; score: number }> = [];

  if (tokens.length > 0 && (meeting.transcriptText || meeting.summaryMd)) {
    if (meeting.transcriptText) {
      for (const chunk of splitIntoChunks(meeting.transcriptText)) {
        const sc = scoreText(chunk, tokens);
        if (sc > 0) citations.push({ source: "transcript", text: chunk, score: sc });
      }
    }

    if (meeting.summaryMd) {
      // summary is markdown; treat each list/paragraph as chunk.
      for (const chunk of splitIntoChunks(meeting.summaryMd.replace(/```[\s\S]*?```/g, ""))) {
        const sc = scoreText(chunk, tokens);
        if (sc > 0) citations.push({ source: "summary", text: chunk, score: sc });
      }
    }
  }

  citations.sort((a, b) => b.score - a.score || a.source.localeCompare(b.source));

  const top = citations.slice(0, 6).map((c) => ({ ...c, text: c.text.slice(0, 800) }));

  const answerMd =
    top.length === 0
      ? "I couldn’t find an exact match in the stored transcript/summary yet. Try different keywords, or run Transcribe/Summarize first."
      : [
          "**Relevant excerpts (v0 local retrieval):**",
          "",
          ...top.map((c, i) => `- (${i + 1}) **${c.source}** (score ${c.score}):\n\n> ${c.text.replace(/\n/g, "\n> ")}`),
        ].join("\n");

  const thread = await prisma.qAThread.create({
    data: {
      meetingId: meeting.id,
      question,
      answerMd,
      citations: top as unknown as object,
    },
    select: { id: true, question: true, answerMd: true, createdAt: true },
  });

  return NextResponse.json({
    ok: true,
    thread: { ...thread, createdAt: thread.createdAt.toISOString() },
  });
}
