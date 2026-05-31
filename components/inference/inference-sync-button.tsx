"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCwIcon } from "lucide-react";

type Phase = "idle" | "syncing" | "synced" | "error";

type SyncResponse = {
  error?: string;
  executions?: Array<{
    queryId: number;
    ok: boolean;
    executionId: string | null;
    state: string | null;
    error: string | null;
  }>;
};

export function InferenceSyncButton() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");

  async function handleSync() {
    setPhase("syncing");
    setMessage("");

    try {
      const res = await fetch("/api/inference/sync", { method: "POST" });
      const data = (await res.json()) as SyncResponse;

      if (!res.ok || data.error) {
        setPhase("error");
        setMessage(data.error ?? "Dune refresh failed");
        return;
      }

      const count = data.executions?.length ?? 0;
      setPhase("synced");
      setMessage(`Started ${count} Dune query refresh${count === 1 ? "" : "es"}`);
    } catch (e) {
      setPhase("error");
      setMessage((e as Error).message);
    }
  }

  const syncing = phase === "syncing";

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={handleSync}
        disabled={syncing}
        variant={phase === "error" ? "destructive" : "default"}
        size="sm"
      >
        <RefreshCwIcon className={`size-3.5 ${syncing ? "animate-spin" : ""}`} />
        {syncing ? "Syncing…" : phase === "synced" ? "Synced ✅" : "Sync"}
      </Button>
      {message && (
        <span className="hidden sm:block text-[11px] text-muted-foreground max-w-[260px] truncate">
          {message}
        </span>
      )}
    </div>
  );
}
