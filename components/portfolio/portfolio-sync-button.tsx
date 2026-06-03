"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCwIcon } from "lucide-react";

type Phase = "idle" | "dispatching" | "running" | "done" | "error";

export function PortfolioSyncButton() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");

  async function handleSync() {
    setPhase("dispatching");
    setMessage("");

    try {
      // Dispatch GH Actions workflow — returns immediately with a runId.
      // The sync runs fully server-side; closing the browser is fine.
      const res = await fetch("/api/portfolio/dispatch", { method: "POST" });
      const data = await res.json();

      if (res.status === 429 && data.tooSoon) {
        setPhase("error");
        setMessage(data.message ?? "Synced recently — try again later");
        return;
      }
      if (!res.ok || data.error) {
        // Fallback: if dispatch isn't available, try the direct sync
        if (data.fallback) {
          await runDirectSync();
          return;
        }
        setPhase("error");
        setMessage(data.error ?? "Dispatch failed");
        return;
      }

      // Dispatched — poll run status in background, refresh page when done
      setPhase("running");
      setMessage("Running in background…");
      pollRunStatus(data.runId);
    } catch (e) {
      setPhase("error");
      setMessage((e as Error).message);
    }
  }

  async function runDirectSync() {
    // Direct sync — uses next/server after(), so safe to close the browser.
    setPhase("running");
    setMessage("Running in background…");
    try {
      const res = await fetch("/api/portfolio/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.error) {
        setPhase("error");
        setMessage(data.error ?? "Sync failed");
        return;
      }
      // Sync is running server-side; show started state and refresh after a moment.
      setPhase("done");
      setMessage("Sync started!");
      setTimeout(() => {
        router.refresh();
        setPhase("idle");
        setMessage("");
      }, 3000);
    } catch (e) {
      setPhase("error");
      setMessage((e as Error).message);
    }
  }

  async function pollRunStatus(runId: number) {
    const deadline = Date.now() + 10 * 60 * 1000; // 10 min max polling
    const POLL_MS = 8000;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      try {
        const res = await fetch(`/api/gh-sync/${runId}/status`);
        if (!res.ok) continue;
        const data = await res.json();

        if (data.status === "completed") {
          if (data.conclusion === "success") {
            router.refresh();
            setPhase("done");
            setMessage("Sync complete!");
            setTimeout(() => { setPhase("idle"); setMessage(""); }, 4000);
          } else {
            setPhase("error");
            setMessage(`Sync ${data.conclusion ?? "failed"}`);
          }
          return;
        }
        if (data.status === "in_progress" || data.status === "queued") {
          setMessage(`Running… (${data.status})`);
          continue;
        }
      } catch {
        // network blip — keep polling
      }
    }

    // Timed out polling — sync may still be running
    setPhase("idle");
    setMessage("");
    router.refresh();
  }

  const label =
    phase === "dispatching" ? "Starting…"
    : phase === "running" ? "Running…"
    : phase === "done" ? "Done!"
    : "Sync";

  const spinning = phase === "dispatching" || phase === "running";

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={handleSync}
        disabled={phase === "dispatching" || phase === "running"}
        variant={phase === "error" ? "destructive" : phase === "done" ? "secondary" : "default"}
        size="sm"
      >
        <RefreshCwIcon
          className={`size-3.5 ${spinning ? "animate-spin" : ""}`}
        />
        {label}
      </Button>
      {message && (
        <span className="hidden sm:block text-[11px] text-muted-foreground max-w-[240px] truncate">
          {message}
        </span>
      )}
    </div>
  );
}
