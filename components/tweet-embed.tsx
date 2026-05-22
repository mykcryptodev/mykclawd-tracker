"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

const Tweet = dynamic(() => import("react-tweet").then((m) => m.Tweet), {
  ssr: false,
  loading: () => <div className="h-24 animate-pulse rounded-xl bg-muted/40" />,
});

export function TweetEmbed({ id }: { id: string }) {
  return (
    <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-muted/40" />}>
      <Tweet id={id} />
    </Suspense>
  );
}
