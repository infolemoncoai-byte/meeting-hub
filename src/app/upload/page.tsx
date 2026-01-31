"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function UploadPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!file) {
      setError("Audio file is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("title", title.trim());
      fd.set("file", file);

      const res = await fetch("/api/meetings/upload", {
        method: "POST",
        body: fd,
      });

      const data = (await res.json().catch(() => null)) as null | { id?: string; error?: string };

      if (!res.ok) {
        throw new Error(data?.error || `Upload failed (${res.status})`);
      }

      if (!data?.id) throw new Error("Upload succeeded but missing meeting id");

      router.push(`/meetings/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Upload audio</h1>
        <p className="text-sm text-muted-foreground">Accepts .m4a or .wav. Creates a Meeting row and stores the file on disk.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-lg border p-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">Title</label>
          <input
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Weekly sync"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Audio file</label>
          <input
            className="w-full text-sm"
            type="file"
            accept="audio/wav,audio/x-wav,audio/m4a,audio/mp4,.wav,.m4a"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>

        {error ? <div className="text-sm text-red-600">{error}</div> : null}

        <button
          disabled={isSubmitting}
          className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-60"
          type="submit"
        >
          {isSubmitting ? "Uploading…" : "Upload"}
        </button>
      </form>
    </main>
  );
}
