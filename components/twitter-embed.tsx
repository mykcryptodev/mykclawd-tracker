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
        window.twttr.widgets
          .createTweet(
            tweetUrl.split("/status/")[1]?.split("?")[0] ?? "",
            container,
            { theme: resolvedTheme === "light" ? "light" : "dark", dnt: true, align: "left", width: "550" }
          )
          // Strip Twitter's injected inline border/shadow after the widget renders
          .then((el: HTMLElement | undefined) => {
            if (!el) return;
            const strip = (node: HTMLElement) => {
              node.style.background = "transparent";
              node.style.border = "none";
              node.style.boxShadow = "none";
              node.style.outline = "none";
            };
            strip(el);
            // Also strip on child iframe when it eventually loads
            const iframe = el.querySelector("iframe");
            if (iframe) strip(iframe as HTMLElement);
            // Watch for deferred iframe injection
            const obs = new MutationObserver(() => {
              const f = el.querySelector("iframe");
              if (f) { strip(f as HTMLElement); obs.disconnect(); }
            });
            obs.observe(el, { childList: true, subtree: true });
          });
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
    <div className="mt-4">
      {/* Wrapper clips the 1px border Twitter injects around twitterwidget via overflow:hidden */}
      <div
        className="overflow-hidden rounded-xl"
        style={{ margin: "-1px" }}
      >
        <div ref={containerRef} style={{ margin: "1px" }} />
      </div>
    </div>
  );
}
