"use client";

import { useState } from "react";

export function SummarizeButton({ meetingId, disabled }: { meetingId: string; disabled: boolean }) {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    setIsRunning(true);

    try {
      const res = await fetch(`/api/meetings/${meetingId}/summarize`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as null | { error?: string; detail?: string };
      if (!res.ok) {
        throw new Error([data?.error, data?.detail].filter(Boolean).join(": ") || `Failed (${res.status})`);
      }

      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || isRunning}
        className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-60"
      >
        {isRunning ? "Summarizing…" : "Summarize"}
      </button>
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
    </div>
  );
}
