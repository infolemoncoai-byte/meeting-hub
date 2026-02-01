import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

function pickText(resJson: unknown): string {
  if (!resJson || typeof resJson !== "object") return "";

  const root = resJson as Record<string, unknown>;
  const outputText = root["output_text"];
  if (typeof outputText === "string") return outputText;

  const out = root["output"];
  if (!Array.isArray(out)) return "";

  const parts: string[] = [];
  for (const item of out) {
    if (!item || typeof item !== "object") continue;
    const itemObj = item as Record<string, unknown>;
    const content = itemObj["content"];
    if (!Array.isArray(content)) continue;

    for (const c of content) {
      if (!c || typeof c !== "object") continue;
      const cObj = c as Record<string, unknown>;
      const text = cObj["text"];
      if (typeof text === "string") parts.push(text);
    }
  }

  return parts.join("\n").trim();
}

async function summarizeWithOpenAI(transcript: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const system =
    "You are a meeting assistant. Create a concise, structured meeting summary in Chinese. Output MUST be Markdown.";

  const user = `Summarize the meeting transcript below.\n\nRequirements:\n- Language: Chinese (keep product names / code identifiers in original language).\n- Format: Markdown only.\n- Sections (in this order):\n  1) Decisions\n  2) Action Items (include owner if mentioned)\n  3) Risks / Open Questions\n  4) Key Topics\n  5) Glossary (terms + short explanations if needed)\n- Be faithful to the transcript; if missing info, say "未提及" or "不确定" instead of inventing.\n\nTranscript:\n\n${transcript}`;

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
    }),
  });

  const json = await resp.json().catch(() => null);

  if (!resp.ok) {
    const detail = json ? JSON.stringify(json).slice(0, 1500) : "(no body)";
    throw new Error(`OpenAI call failed (${resp.status}): ${detail}`);
  }

  const text = pickText(json);
  if (!text) throw new Error("OpenAI returned empty summary text");

  return text.trim();
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { id: true, status: true, transcriptText: true },
  });

  if (!meeting) {
    return NextResponse.json({ error: "meeting not found" }, { status: 404 });
  }
  if (!meeting.transcriptText) {
    return NextResponse.json({ error: "meeting has no transcriptText" }, { status: 400 });
  }

  // Only allow from a small set of states.
  if (!(meeting.status === "TRANSCRIBED" || meeting.status === "FAILED")) {
    return NextResponse.json(
      { error: `cannot summarize when status=${meeting.status}` },
      { status: 409 },
    );
  }

  await prisma.meeting.update({
    where: { id: meeting.id },
    data: { status: "SUMMARIZING", summaryMd: null },
    select: { id: true },
  });

  try {
    const summaryMd = await summarizeWithOpenAI(meeting.transcriptText);

    await prisma.meeting.update({
      where: { id: meeting.id },
      data: {
        status: "READY",
        summaryMd,
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
        summaryMd: null,
      },
      select: { id: true },
    });

    return NextResponse.json(
      {
        error: "summarization failed",
        detail: msg,
        hint: "Set OPENAI_API_KEY (and optionally OPENAI_MODEL) in .env.",
      },
      { status: 500 },
    );
  }
}
