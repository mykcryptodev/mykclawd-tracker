"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCwIcon } from "lucide-react";

type Phase = "idle" | "syncing" | "error";

export function PortfolioSyncButton() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");

  async function handleSync() {
    setPhase("syncing");
    setMessage("");
    try {
      const res = await fetch("/api/portfolio/sync", { method: "POST" });
      const data = await res.json();

      if (res.status === 429 && data.tooSoon) {
        setPhase("error");
        setMessage(data.message ?? "Synced recently — try again later");
        return;
      }
      if (!res.ok || data.error) {
        setPhase("error");
        setMessage(data.error ?? "Sync failed");
        return;
      }

      // Re-run the server component to pick up fresh data, then reset.
      router.refresh();
      setPhase("idle");
    } catch (e) {
      setPhase("error");
      setMessage((e as Error).message);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={handleSync}
        disabled={phase === "syncing"}
        variant={phase === "error" ? "destructive" : "default"}
        size="sm"
      >
        <RefreshCwIcon
          className={`size-3.5 ${phase === "syncing" ? "animate-spin" : ""}`}
        />
        {phase === "syncing" ? "Syncing…" : "Sync"}
      </Button>
      {message && (
        <span className="hidden sm:block text-[11px] text-muted-foreground max-w-[220px] truncate">
          {message}
        </span>
      )}
    </div>
  );
}
