export type OpenPullRequest = {
  htmlUrl: string;
  title: string;
  repoLabel: string;
  number: number;
  updatedLabel: string;
};

type SearchItem = {
  html_url: string;
  title: string;
  number: number;
  repository_url: string;
  updated_at: string;
};

function repoLabelFromRepositoryUrl(url: string): string {
  const m = url.match(/\/repos\/(.+)$/);
  return m?.[1] ?? "unknown";
}

function formatUpdated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export type OpenPullRequestsResult =
  | { ok: true; items: OpenPullRequest[] }
  | { ok: false; items: []; error: string };

/**
 * Open PRs you authored — same filter GitHub uses for “Created by you” on /pulls.
 * @see https://docs.github.com/en/rest/search/search#search-issues-and-pull-requests
 */
export async function fetchOpenPullRequestsByAuthor(): Promise<OpenPullRequestsResult> {
  const login = process.env.GITHUB_LOGIN?.trim() || "mykclawd";
  const q = encodeURIComponent(`is:pr is:open author:${login} archived:false`);
  const token = process.env.GITHUB_TOKEN?.trim();

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetch(
      `https://api.github.com/search/issues?q=${q}&sort=updated&order=desc&per_page=20`,
      { headers, next: { revalidate: 300 } },
    );

    if (res.status === 403) {
      const text = await res.text();
      const rateLimited = text.includes("rate limit") || res.headers.get("x-ratelimit-remaining") === "0";
      return {
        ok: false,
        items: [],
        error: rateLimited
          ? "GitHub rate limit reached. Set GITHUB_TOKEN for higher limits."
          : "GitHub refused this request (check token scopes).",
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        items: [],
        error: `GitHub search failed (${res.status}).`,
      };
    }

    const data = (await res.json()) as { items?: SearchItem[] };
    const items = (data.items ?? []).map((row): OpenPullRequest => ({
      htmlUrl: row.html_url,
      title: row.title,
      number: row.number,
      repoLabel: repoLabelFromRepositoryUrl(row.repository_url),
      updatedLabel: formatUpdated(row.updated_at),
    }));

    return { ok: true, items };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, items: [], error: message };
  }
}

export function githubPullsCreatedByUrl(login: string): string {
  const q = encodeURIComponent(`is:open is:pr author:${login} archived:false`);
  return `https://github.com/pulls?q=${q}`;
}
