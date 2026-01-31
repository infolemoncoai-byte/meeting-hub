import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const meetings = await prisma.meeting.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, title: true, status: true, createdAt: true },
  });

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Meeting Hub</h1>
        <Link className="text-sm underline" href="/upload">
          Upload
        </Link>
      </div>

      <div className="space-y-2">
        {meetings.length === 0 ? (
          <div className="text-sm text-muted-foreground">No meetings yet.</div>
        ) : (
          meetings.map((m: { id: string; title: string; status: string; createdAt: Date }) => (
            <Link key={m.id} href={`/meetings/${m.id}`} className="block rounded-lg border p-3 hover:bg-muted">
              <div className="font-medium">{m.title}</div>
              <div className="text-xs text-muted-foreground">
                {m.status} • {new Date(m.createdAt).toLocaleString()}
              </div>
            </Link>
          ))
        )}
      </div>
    </main>
  );
}
