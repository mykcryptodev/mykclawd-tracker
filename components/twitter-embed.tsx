"use client";

import { useEffect, useRef } from "react";

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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderTweet = () => {
      if (window.twttr?.widgets) {
        container.innerHTML = "";
        window.twttr.widgets.createTweet(
          tweetUrl.split("/status/")[1]?.split("?")[0] ?? "",
          container,
          { theme: "dark", dnt: true }
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
  }, [tweetUrl]);

  return <div ref={containerRef} className="mt-4" />;
}
