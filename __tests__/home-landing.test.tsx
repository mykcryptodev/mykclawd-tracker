/**
 * Smoke tests for HomeLanding component.
 * These catch the class of bugs where react-tweet or other imports
 * crash the homepage by throwing during render.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import type { OpenPullRequestsResult } from "@/lib/github/open-pull-requests";

// ---- mocks ----------------------------------------------------------------

// react-tweet: stub out Tweet so it doesn't try to fetch real data in tests
vi.mock("react-tweet", () => ({
  Tweet: ({ id }: { id: string }) => <div data-testid={`tweet-${id}`} />,
}));

// next/image: not needed in jsdom
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

// next/navigation: usePathname etc. (used indirectly via sidebar)
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Dynamic imports after mocks are in place
});

describe("HomeLanding", () => {
  const openPRs: OpenPullRequestsResult = {
    ok: true,
    items: [
      {
        htmlUrl: "https://github.com/test/repo/pull/1",
        title: "Test PR",
        repoLabel: "test/repo",
        number: 1,
        updatedLabel: "May 1, 2026",
      },
    ],
  };

  it("renders without throwing", async () => {
    const { HomeLanding } = await import("@/components/home-landing");
    expect(() =>
      render(
        <HomeLanding
          trackedAddress="0xcef6e6639e0c60d5c0805670f4363a6698081fab"
          openPullRequests={openPRs}
          githubPullsUrl="https://github.com/pulls"
        />
      )
    ).not.toThrow();
  });

  it("renders the tweet section without crashing", async () => {
    const { HomeLanding } = await import("@/components/home-landing");
    render(
      <HomeLanding
        trackedAddress="0xcef6e6639e0c60d5c0805670f4363a6698081fab"
        openPullRequests={openPRs}
        githubPullsUrl="https://github.com/pulls"
      />
    );
    // Page header should be present — verifies component rendered to completion
    expect(screen.getByText("myk_clawd")).toBeInTheDocument();
  });

  it("renders PR list when PRs are available", async () => {
    const { HomeLanding } = await import("@/components/home-landing");
    render(
      <HomeLanding
        trackedAddress="0xcef6e6639e0c60d5c0805670f4363a6698081fab"
        openPullRequests={openPRs}
        githubPullsUrl="https://github.com/pulls"
      />
    );
    expect(screen.getByText("Test PR")).toBeInTheDocument();
  });

  it("handles error state without crashing", async () => {
    const { HomeLanding } = await import("@/components/home-landing");
    const failedPRs: OpenPullRequestsResult = {
      ok: false,
      items: [],
      error: "GitHub rate limit reached.",
    };
    expect(() =>
      render(
        <HomeLanding
          trackedAddress="0xcef6e6639e0c60d5c0805670f4363a6698081fab"
          openPullRequests={failedPRs}
          githubPullsUrl="https://github.com/pulls"
        />
      )
    ).not.toThrow();
  });
});
