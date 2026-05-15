"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

interface TwitterEmbedProps {
  tweetUrl: string;
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    twttr?: any;
  }
}

export function TwitterEmbed({ tweetUrl }: TwitterEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderTweet = () => {
      if (window.twttr?.widgets) {
        container.innerHTML = "";
        window.twttr.widgets.createTweet(
          tweetUrl.split("/status/")[1]?.split("?")[0] ?? "",
          container,
          { theme: resolvedTheme === "light" ? "light" : "dark", dnt: true, align: "left", width: "550" }
        );
      }
    };

    if (window.twttr?.widgets) {
      renderTweet();
    } else {
      const script = document.getElementById("twitter-wjs");
      if (!script) {
        const s = document.createElement("script");
        s.id = "twitter-wjs";
        s.src = "https://platform.twitter.com/widgets.js";
        s.async = true;
        s.onload = renderTweet;
        document.head.appendChild(s);
      } else {
        script.addEventListener("load", renderTweet);
      }
    }
  }, [tweetUrl, resolvedTheme]);

  return (
    <div
      ref={containerRef}
      className="mt-4 [&_iframe]:!rounded-xl [&_.twitter-tweet]:!m-0 [&_iframe]:!border-0"
      style={{ background: "transparent" }}
    />
  );
}
