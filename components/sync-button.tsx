"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { RunStatus, JobStatus } from "@/app/api/gh-sync/[runId]/status/route";

type Phase = "idle" | "dispatching" | "running" | "done" | "error";

interface State {
  phase: Phase;
  runId: number | null;
  runUrl: string | null;
  jobs: JobStatus[];
  conclusion: string | null;
  error: string;
}

const INITIAL: State = {
  phase: "idle",
  runId: null,
  runUrl: null,
  jobs: [],
  conclusion: null,
  error: "",
};

const POLL_MS = 4000;

function jobIcon(j: JobStatus) {
  if (j.status === "completed") {
    if (j.conclusion === "success") return "✅";
    if (j.conclusion === "failure") return "❌";
    if (j.conclusion === "cancelled") return "🚫";
    return "⚠️";
  }
  if (j.status === "in_progress") return "⏳";
  return "⬜"; // queued
}

export function SyncButton() {
  const [state, setState] = useState<State>(INITIAL);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  useEffect(() => () => stopPolling(), []);

  async function pollStatus(runId: number) {
    try {
      const res = await fetch(`/api/gh-sync/${runId}/status`);
      if (!res.ok) return;
      const data: RunStatus = await res.json();

      setState((s) => ({
        ...s,
        jobs: data.jobs,
        runUrl: data.htmlUrl,
        conclusion: data.conclusion,
        phase: data.status === "completed" ? "done" : "running",
      }));

      if (data.status === "completed") {
        stopPolling();
        // Reload after a short pause so fresh data appears
        setTimeout(() => window.location.reload(), 2000);
      }
    } catch {
      // transient — keep polling
    }
  }

  async function handleSync() {
    setState({ ...INITIAL, phase: "dispatching" });

    try {
      const res = await fetch("/api/gh-sync", { method: "POST" });
      const data = await res.json();
      if (res.status === 429 && data.tooSoon) {
        setState((s) => ({ ...s, phase: "error", error: data.message ?? "Synced recently — try again later" }));
        return;
      }
      if (!res.ok || data.error) {
        setState((s) => ({ ...s, phase: "error", error: data.error ?? "Dispatch failed" }));
        return;
      }

      const { runId } = data as { runId: number };
      setState((s) => ({ ...s, phase: "running", runId }));

      // Start polling
      await pollStatus(runId);
      intervalRef.current = setInterval(() => pollStatus(runId), POLL_MS);
    } catch (e) {
      setState((s) => ({ ...s, phase: "error", error: (e as Error).message }));
    }
  }

  const { phase, jobs, runUrl, conclusion, error } = state;

  if (phase === "idle" || phase === "done" || phase === "error") {
    const label =
      phase === "done"
        ? conclusion === "success"
          ? "Synced ✅"
          : `Sync ${conclusion ?? "done"}`
        : "Sync";
    return (
      <div className="flex items-center gap-2">
        <Button
          onClick={handleSync}
          variant={phase === "error" ? "destructive" : "default"}
          size="sm"
        >
          {label}
        </Button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    );
  }

  if (phase === "dispatching") {
    return (
      <div className="flex items-center gap-2">
        <Button disabled size="sm" variant="outline">
          <span className="animate-pulse">Dispatching…</span>
        </Button>
      </div>
    );
  }

  // running
  return (
    <div className="flex flex-col gap-1 min-w-[220px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium">GitHub Actions running…</span>
        {runUrl && (
          <a
            href={runUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            view
          </a>
        )}
      </div>
      {jobs.length === 0 ? (
        <span className="text-xs text-muted-foreground animate-pulse">Queued…</span>
      ) : (
        <ul className="space-y-0.5">
          {jobs.map((j) => (
            <li key={j.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{jobIcon(j)}</span>
              <span className={j.status === "in_progress" ? "font-medium text-foreground animate-pulse" : ""}>
                {j.name}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
