import type { Metadata } from "next";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ExternalLinkIcon } from "lucide-react";
import { InferenceSyncButton } from "@/components/inference/inference-sync-button";
import { UsdcApproval } from "@/components/inference/usdc-approval";

export const metadata: Metadata = {
  title: "Inference",
};

const DUNE_DASHBOARD_URL =
  "https://dune.com/mykcryptodev/surplus-intelligence-compute-supplier-breakdown";

const TRACKED_ADDRESS =
  process.env.TRACKED_ADDRESS ??
  "0xcef6e6639e0c60d5c0805670f4363a6698081fab";

// Visualization embed IDs from the Dune dashboard
const SPEND_OVER_TIME_EMBED = "https://dune.com/embeds/7560232/11512597";
const SUPPLIER_PIE_EMBED = "https://dune.com/embeds/7560157/11512563";
const SUPPLIER_TABLE_EMBED = "https://dune.com/embeds/7560157/11512565";
const TOTAL_SPEND_EMBED = "https://dune.com/embeds/7560211/11512570";
const UNIQUE_SUPPLIERS_EMBED = "https://dune.com/embeds/7560211/11512571";
const TOTAL_PAYMENTS_EMBED = "https://dune.com/embeds/7560211/11512572";

export default function InferencePage() {
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
        <SiteHeader
          address={TRACKED_ADDRESS}
          title="Inference"
          titleHelpHref="https://x.com/myk_clawd/status/2058564046907912668"
          titleHelpLabel="Thread on Inference (opens on X)"
          syncSlot={<InferenceSyncButton />}
        />
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">

          {/* Header + Dune link */}
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground max-w-2xl">
              Compute purchased via{" "}
              <a
                href="https://surplus-intelligence.vercel.app"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Surplus Intelligence
              </a>
              {" "}— an on-chain AI inference marketplace where compute nodes compete to serve requests.
            </p>
            <a
              href={DUNE_DASHBOARD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit mt-1"
            >
              <ExternalLinkIcon className="size-3" />
              Open on Dune — plug in any address to see your own supplier breakdown
            </a>
          </div>

          {/* Live on-chain USDC approval */}
          <UsdcApproval />

          {/* Counter stats row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
              <iframe
                src={TOTAL_SPEND_EMBED}
                title="Total USDC Spent"
                className="w-full border-0"
                style={{ height: "160px" }}
                loading="lazy"
              />
            </div>
            <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
              <iframe
                src={UNIQUE_SUPPLIERS_EMBED}
                title="Unique Suppliers"
                className="w-full border-0"
                style={{ height: "160px" }}
                loading="lazy"
              />
            </div>
            <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
              <iframe
                src={TOTAL_PAYMENTS_EMBED}
                title="Total Payments"
                className="w-full border-0"
                style={{ height: "160px" }}
                loading="lazy"
              />
            </div>
          </div>

          {/* Spend over time — full width */}
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <p className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
                Spend Over Time
              </p>
            </div>
            <iframe
              src={SPEND_OVER_TIME_EMBED}
              title="Compute Spend Over Time"
              className="w-full h-80 border-0"
              loading="lazy"
            />
          </div>

          {/* Pie + Table side by side */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
              <div className="px-4 pt-4 pb-2">
                <p className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
                  Supplier Share
                </p>
              </div>
              <iframe
                src={SUPPLIER_PIE_EMBED}
                title="Supplier Breakdown Pie Chart"
                className="w-full h-72 border-0"
                loading="lazy"
              />
            </div>
            <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
              <div className="px-4 pt-4 pb-2">
                <p className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground">
                  Supplier Breakdown
                </p>
              </div>
              <iframe
                src={SUPPLIER_TABLE_EMBED}
                title="Supplier Breakdown Table"
                className="w-full h-72 border-0"
                loading="lazy"
              />
            </div>
          </div>

          {/* Footer attribution */}
          <p className="text-[11px] text-muted-foreground">
            Powered by{" "}
            <a
              href={DUNE_DASHBOARD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Dune
            </a>
            {" "}· Data from Base via SI settlement contract{" "}
            <span className="font-mono">0x0770d21...</span>
          </p>

        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
