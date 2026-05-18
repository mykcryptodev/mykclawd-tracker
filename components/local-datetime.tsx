"use client";

import { useEffect, useState } from "react";

interface Props {
  /** Unix timestamp in seconds */
  ts: number;
  /** Show date and time (default) or date only */
  mode?: "datetime" | "date";
}

function fmt(ts: number, mode: "datetime" | "date") {
  const d = new Date(ts * 1000);
  if (mode === "date") {
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Renders a timestamp in the user's browser local timezone.
 * Shows a neutral placeholder during SSR / before hydration to avoid
 * hydration mismatches.
 */
export function LocalDateTime({ ts, mode = "datetime" }: Props) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    setLabel(fmt(ts, mode));
  }, [ts, mode]);

  // Before hydration: show a short UTC placeholder so SSR HTML is stable
  if (label === null) {
    const d = new Date(ts * 1000);
    const fallback =
      mode === "date"
        ? d.toISOString().slice(0, 10)
        : d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
    return <span suppressHydrationWarning>{fallback}</span>;
  }

  return <span>{label}</span>;
}
