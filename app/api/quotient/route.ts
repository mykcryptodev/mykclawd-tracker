import { NextResponse } from "next/server";
import { QUOTIENT_GIST_RAW_URL } from "@/lib/quotient-gist";

// The Quotient Mirror strategy state lives on myk's host (not reachable by
// Vercel). scripts/sync-quotient.ts publishes a JSON snapshot to a public
// gist every 15 min; this route just proxies it with a short cache.
export async function GET() {
  try {
    const res = await fetch(QUOTIENT_GIST_RAW_URL, {
      next: { revalidate: 60 }, // 1 min edge cache; gist updates every 15 min
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `gist fetch failed: HTTP ${res.status}` },
        { status: 502 },
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "failed to fetch quotient snapshot" },
      { status: 500 },
    );
  }
}
