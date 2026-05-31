import type { Metadata } from "next";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { X402Demo } from "./x402-demo";

export const metadata: Metadata = {
  title: "X Account Signals API",
  description:
    "A pay-per-use API powered by x402 for X/Twitter account signals.",
};

const TRACKED_ADDRESS =
  process.env.TRACKED_ADDRESS ??
  "0xcef6e6639e0c60d5c0805670f4363a6698081fab";

const responseShape = `{
  "handle": "string",
  "userId": "string",
  "createdAt": "ISO date",
  "signals": {
    "activityByMonth": { "YYYY-MM": number },
    "tweetCount": number,
    "windowStart": "ISO date | null",
    "windowEnd": "ISO date | null",
    "windowCapped": boolean,
    "windowCapNote": "string | null",
    "geo": { "location": "string | null", "source": "string | null" },
    "usernameHistory": { "previousUsernames": ["string"] | null }
  }
}`;

export default function X402Page() {
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
        <SiteHeader address={TRACKED_ADDRESS} title="X Account Signals" />
        <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
          <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm md:p-8">
            <div className="flex max-w-4xl flex-col gap-4">
              <div className="flex w-fit items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
                <span className="size-2 rounded-full bg-chart-2" />
                x402 · Base mainnet · $2.00 USDC
              </div>
              <div className="space-y-3">
                <h1 className="text-3xl font-bold tracking-tight md:text-5xl">
                  X Account Signals API
                </h1>
                <p className="max-w-3xl text-base leading-7 text-muted-foreground md:text-lg">
                  A pay-per-use API powered by x402. Enter any X/Twitter
                  handle to get account signals — tweet activity patterns,
                  location, and username history — for $2.00 USDC per lookup.
                </p>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,480px)]">
            <div className="flex flex-col gap-6">
              <section className="rounded-xl border border-border/60 bg-card p-5">
                <div className="mb-5 flex flex-col gap-1">
                  <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                    How it works
                  </p>
                  <h2 className="text-xl font-semibold tracking-tight">
                    Plain-English x402 flow
                  </h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    {
                      title: "Call the endpoint",
                      body: "Your app requests the account-signals URL. If payment is required, the server returns 402 Payment Required.",
                    },
                    {
                      title: "Sign payment auth",
                      body: "Your wallet signs a USDC transfer authorization. No gas is needed because this uses EIP-3009.",
                    },
                    {
                      title: "Retry with payment",
                      body: "The request is retried with the x402 payment header. If it validates, the API returns the account signals.",
                    },
                    {
                      title: "Settle on Base",
                      body: "The USDC payment settles on Base mainnet, so the lookup is paid per use without accounts or API keys.",
                    },
                  ].map((step, index) => (
                    <div
                      key={step.title}
                      className="rounded-xl border border-border/60 bg-background/50 p-4"
                    >
                      <div className="mb-3 flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                        {index + 1}
                      </div>
                      <h3 className="font-medium">{step.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {step.body}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-border/60 bg-card p-5">
                <div className="mb-5 flex flex-col gap-1">
                  <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                    API docs
                  </p>
                  <h2 className="text-xl font-semibold tracking-tight">
                    Endpoint and response
                  </h2>
                </div>
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-xl border border-border/60 bg-background/60">
                    <div className="border-b border-border/60 px-4 py-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                      GET
                    </div>
                    <code className="block overflow-x-auto p-4 text-sm">
                      https://xsignal.mykclawd.xyz/x-account-signals?handle={"{twitter_handle}"}
                    </code>
                  </div>

                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div className="rounded-lg bg-muted/40 p-3">
                      <dt className="text-muted-foreground">Cost</dt>
                      <dd className="mt-1 font-medium">
                        $2.00 USDC on Base mainnet (eip155:8453)
                      </dd>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-3">
                      <dt className="text-muted-foreground">Facilitator</dt>
                      <dd className="mt-1 break-all font-medium">
                        https://facilitator.payai.network
                      </dd>
                    </div>
                  </dl>

                  <p className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm leading-6 text-muted-foreground">
                    Fetches up to 200 tweets from the last 12 months. If
                    <code className="mx-1 rounded bg-background px-1 py-0.5 text-foreground">
                      windowCapped: true
                    </code>
                    the account has more activity beyond what was fetched.
                  </p>

                  <div className="overflow-hidden rounded-xl border border-border/60 bg-background/60">
                    <div className="border-b border-border/60 px-4 py-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                      Response shape
                    </div>
                    <pre className="overflow-x-auto p-4 text-xs leading-5 text-foreground">
                      <code>{responseShape}</code>
                    </pre>
                  </div>
                </div>
              </section>
            </div>

            <X402Demo />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
