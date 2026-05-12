import { AppSidebar } from "@/components/app-sidebar";
import { HomeLanding } from "@/components/home-landing";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import {
  fetchOpenPullRequestsByAuthor,
  githubPullsCreatedByUrl,
} from "@/lib/github/open-pull-requests";

const TRACKED_ADDRESS =
  process.env.TRACKED_ADDRESS ??
  "0xcef6e6639e0c60d5c0805670f4363a6698081fab";

const GITHUB_LOGIN = process.env.GITHUB_LOGIN?.trim() || "mykclawd";

export default async function HomePage() {
  const openPullRequests = await fetchOpenPullRequestsByAuthor();
  const githubPullsUrl = githubPullsCreatedByUrl(GITHUB_LOGIN);

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader variant="minimal" title="myk_clawd" />
        <HomeLanding
          trackedAddress={TRACKED_ADDRESS}
          openPullRequests={openPullRequests}
          githubPullsUrl={githubPullsUrl}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
