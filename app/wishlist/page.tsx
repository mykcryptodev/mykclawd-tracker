import type { Metadata } from "next";
import Link from "next/link";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { WishlistDashboard } from "@/components/wishlist/wishlist-dashboard";
import { getWishlistStats } from "@/lib/wishlist/stats";

export const metadata: Metadata = {
  title: "Wishlist",
};

const TRACKED_ADDRESS =
  process.env.TRACKED_ADDRESS ??
  "0xcef6e6639e0c60d5c0805670f4363a6698081fab";

export default async function WishlistPage() {
  const stats = await getWishlistStats();

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
        <SiteHeader address={TRACKED_ADDRESS} title="Wishlist" showSync={false} />
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
          <p className="text-sm text-muted-foreground max-w-2xl">
            How people use{" "}
            <a
              href="https://wishlist.holiday/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              wishlist.holiday
            </a>
            , the holiday gift-exchange app on web, iOS and Android. AI spend for its Muse calls is on the{" "}
            <Link href="/inference" className="underline underline-offset-2 hover:text-foreground">
              Inference
            </Link>{" "}
            page.
          </p>
          <WishlistDashboard data={stats} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
