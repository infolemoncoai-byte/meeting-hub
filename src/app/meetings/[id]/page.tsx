import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

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
    },
  });

  if (!meeting) return notFound();

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

      <div className="text-sm text-muted-foreground">
        Next: MSU2 will add a Transcribe button + worker.
      </div>
    </main>
  );
}
