const RAW_SKILL_URL =
  "https://raw.githubusercontent.com/mykclawd/skills-fork/add-birdbets-market/birdbets/birdbets-market/SKILL.md";

export async function GET() {
  const res = await fetch(RAW_SKILL_URL, { next: { revalidate: 3600 } });
  if (!res.ok) {
    return new Response("Failed to fetch skill", { status: 502 });
  }
  const text = await res.text();
  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
    },
  });
}
