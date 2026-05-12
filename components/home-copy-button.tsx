"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function HomeCopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      setDone(false);
    }
  }

  return (
    <Button type="button" variant="ghost" size="sm" className="h-7 text-xs font-normal" onClick={copy}>
      {done ? "Copied" : label}
    </Button>
  );
}
