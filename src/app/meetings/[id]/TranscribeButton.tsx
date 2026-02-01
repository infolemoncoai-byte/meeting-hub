"use client";

import { useState } from "react";

export function TranscribeButton({ meetingId, disabled }: { meetingId: string; disabled: boolean }) {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    setIsRunning(true);

    try {
      const res = await fetch(`/api/meetings/${meetingId}/transcribe`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as null | { error?: string; detail?: string };
      if (!res.ok) {
        throw new Error([data?.error, data?.detail].filter(Boolean).join(": ") || `Failed (${res.status})`);
      }

      // If the worker is detached, we should poll until status leaves TRANSCRIBING.
      // Keeps UX simple without adding websocket/SSE.
      const startedAt = Date.now();
      const timeoutMs = 2 * 60 * 1000;

      while (Date.now() - startedAt < timeoutMs) {
        await new Promise((r) => setTimeout(r, 2000));

        const stRes = await fetch(`/api/meetings/${meetingId}/status`, { cache: "no-store" });
        const st = (await stRes.json().catch(() => null)) as null | {
          status?: string;
          error?: string;
        };

        if (!stRes.ok) {
          throw new Error(st?.error || `Status check failed (${stRes.status})`);
        }

        if (st?.status && st.status !== "TRANSCRIBING") {
          window.location.reload();
          return;
        }
      }

      // If it takes longer than our polling window, just reload; user can refresh again.
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
        {isRunning ? "Transcribing…" : "Transcribe"}
      </button>
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
    </div>
  );
}
