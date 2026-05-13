"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { SyncProgress } from "@/lib/sync";

type Status = "idle" | "syncing" | "done" | "error";

interface State {
  status: Status;
  progress: SyncProgress | null;
  error: string;
  summary: string;
}

export function SyncButton() {
  const [state, setState] = useState<State>({
    status: "idle",
    progress: null,
    error: "",
    summary: "",
  });

  async function handleSync() {
    setState({ status: "syncing", progress: null, error: "", summary: "" });

    try {
      const res = await fetch("/api/sync", { method: "POST" });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        setState((s) => ({ ...s, status: "error", error: data.error ?? "Failed" }));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // SSE lines are separated by \n\n; process all complete events
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.error) {
              setState((s) => ({ ...s, status: "error", error: event.error }));
              return;
            }

            if (event.done) {
              const r = event.result;
              setState((s) => ({
                ...s,
                status: "done",
                progress: null,
                summary: `+${r.newTransfers} token transfers · +${r.nativeEthTransfers ?? 0} ETH transfers · ${(
                  r.durationMs / 1000
                ).toFixed(1)}s`,
              }));
              setTimeout(() => window.location.reload(), 1500);
              return;
            }

            // Progress event
            setState((s) => ({ ...s, progress: event as SyncProgress }));
          } catch {
            // malformed event — ignore
          }
        }
      }
    } catch (e) {
      setState((s) => ({ ...s, status: "error", error: (e as Error).message }));
    }
  }

  const { status, progress, error, summary } = state;

  if (status === "idle" || status === "done" || status === "error") {
    return (
      <div className="flex items-center gap-2">
        <Button
          onClick={handleSync}
          variant={status === "error" ? "destructive" : "default"}
          size="sm"
        >
          {status === "done" ? "Synced" : "Sync Now"}
        </Button>
        {summary && <span className="text-xs text-muted-foreground">{summary}</span>}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    );
  }

  // Syncing — show step progress
  const step = progress?.step ?? 0;
  const total = progress?.totalSteps ?? 7;
  // A step is "done" when it has a detail string and no innerPct (innerPct means mid-step).
  const isStepDone = progress?.detail != null && progress?.innerPct == null;
  const baseSteps = isStepDone ? step : Math.max(0, step - 1);
  const inner = (progress?.innerPct ?? 0) / 100;
  const pct = total > 0 ? Math.round(((baseSteps + inner) / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-1 min-w-[200px]">
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs font-medium">
          {progress
            ? `Step ${step} of ${total}: ${progress.label}`
            : "Starting…"}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {progress?.detail && (
        <p className="text-xs text-muted-foreground">{progress.detail}</p>
      )}
    </div>
  );
}
