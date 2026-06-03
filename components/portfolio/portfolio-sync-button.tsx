"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCwIcon } from "lucide-react";

type Phase = "idle" | "dispatching" | "running" | "done" | "error";

type JsonObject = Record<string, unknown>;

async function readJsonObject(res: Response): Promise<JsonObject> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Expected JSON from sync endpoint, got ${res.status} ${text.slice(0, 80)}`
    );
  }
  return (await res.json()) as JsonObject;
}

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
      const data = await readJsonObject(res);

      if (res.status === 429 && data.tooSoon) {
        setPhase("error");
        setMessage(typeof data.message === "string" ? data.message : "Synced recently — try again later");
        return;
      }
      if (!res.ok || data.error) {
        // Dispatch failed for any reason — fall back to local background sync.
        // The direct sync route uses after(), so it's equally fire-and-forget.
        await runDirectSync();
        return;
      }

      // Dispatched — poll run status in background, refresh page when done
      setPhase("running");
      setMessage("Running in background…");
      if (typeof data.runId === "number") {
        pollRunStatus(data.runId);
      } else {
        // Dispatch succeeded but GitHub's run ID was not available yet.
        // The workflow is still running; refresh shortly instead of polling a bad URL.
        setTimeout(() => {
          router.refresh();
          setPhase("idle");
          setMessage("");
        }, 10_000);
      }
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
      const data = await readJsonObject(res);
      if (!res.ok || data.error) {
        setPhase("error");
        setMessage(typeof data.error === "string" ? data.error : "Sync failed");
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
