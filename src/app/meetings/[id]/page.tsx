import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { TranscribeButton } from "./TranscribeButton";
import { SummarizeButton } from "./SummarizeButton";
import { Markdown } from "@/components/Markdown";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      status: true,
      createdAt: true,
      audioPath: true,
      transcriptText: true,
      summaryMd: true,
    },
  });

  if (!meeting) return notFound();

  const canTranscribe = Boolean(meeting.audioPath) && (meeting.status === "UPLOADED" || meeting.status === "FAILED");
  const canSummarize = Boolean(meeting.transcriptText) && (meeting.status === "TRANSCRIBED" || meeting.status === "FAILED");

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{meeting.title}</h1>
        <Link className="text-sm underline" href="/">
          Home
        </Link>
      </div>

      <div className="rounded-lg border p-4 text-sm">
        <div>
          <span className="text-muted-foreground">ID:</span> {meeting.id}
        </div>
        <div>
          <span className="text-muted-foreground">Status:</span> {meeting.status}
        </div>
        <div>
          <span className="text-muted-foreground">Created:</span> {new Date(meeting.createdAt).toLocaleString()}
        </div>
        <div>
          <span className="text-muted-foreground">Audio path:</span> {meeting.audioPath || "(none)"}
        </div>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <div className="text-sm font-medium">Transcription</div>
        <TranscribeButton meetingId={meeting.id} disabled={!canTranscribe} />

        {meeting.transcriptText ? (
          <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
            {meeting.transcriptText}
          </pre>
        ) : (
          <div className="text-sm text-muted-foreground">No transcript yet.</div>
        )}
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <div className="text-sm font-medium">Summary</div>
        <SummarizeButton meetingId={meeting.id} disabled={!canSummarize} />

        {meeting.summaryMd ? (
          <div className="max-h-[50vh] overflow-auto rounded-md bg-muted p-3">
            <Markdown md={meeting.summaryMd} />
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No summary yet.</div>
        )}
      </div>
    </main>
  );
}
