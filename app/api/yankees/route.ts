import { NextResponse } from "next/server";

const YANKEES_TEAM_ID = 147;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const season = searchParams.get("season") ?? new Date().getFullYear().toString();

  const url = new URL("https://statsapi.mlb.com/api/v1/schedule");
  url.searchParams.set("sportId", "1");
  url.searchParams.set("teamId", String(YANKEES_TEAM_ID));
  url.searchParams.set("season", season);
  url.searchParams.set("gameType", "R");

  try {
    const res = await fetch(url.toString(), {
      // 30s cache: the page now self-heals with a 60s refetch interval plus
      // focus/visibility triggers (see app/yankees/page.tsx), but a 5-minute
      // upstream cache was still capable of serving a stale "Scheduled" result
      // to that refetch for minutes after a game actually went Final.
      next: { revalidate: 30 },
    });
    if (!res.ok) {
      return NextResponse.json({ error: "upstream error" }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "failed to fetch schedule" }, { status: 500 });
  }
}
