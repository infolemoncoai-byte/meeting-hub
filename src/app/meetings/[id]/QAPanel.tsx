"use client";

import { useState } from "react";

export type QAThreadRow = {
  id: string;
  question: string;
  answerMd: string;
  createdAt: string;
};

export function QAPanel({ meetingId, initial }: { meetingId: string; initial: QAThreadRow[] }) {
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const q = question.trim();
    if (!q) {
      setError("Question is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/qa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = (await res.json().catch(() => null)) as null | { error?: string };
      if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);

      setQuestion("");
      // simplest: reload to show new question
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-sm font-medium">Q&A</div>

      <form onSubmit={onSubmit} className="space-y-2">
        <textarea
          className="min-h-[84px] w-full rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="Ask a question about this meeting…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        {error ? <div className="text-sm text-red-600">{error}</div> : null}
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-60"
        >
          {isSubmitting ? "Saving…" : "Save question"}
        </button>
        <div className="text-xs text-muted-foreground">
          (MSU4 stores question history. Answer generation comes later.)
        </div>
      </form>

      <div className="space-y-3">
        {initial.length === 0 ? (
          <div className="text-sm text-muted-foreground">No questions yet.</div>
        ) : (
          initial.map((t) => (
            <div key={t.id} className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleString()}</div>
              <div className="mt-1 text-sm font-medium">Q: {t.question}</div>
              <div className="mt-2 text-sm text-muted-foreground">A: {t.answerMd ? t.answerMd : "(not answered yet)"}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
