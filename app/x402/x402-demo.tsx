"use client";

import { FormEvent, useMemo, useState } from "react";
import { base } from "thirdweb/chains";
import { ConnectButton, useActiveAccount } from "thirdweb/react";
import type { Account } from "thirdweb/wallets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { thirdwebClient } from "@/lib/thirdweb-client";
import { cn } from "@/lib/utils";

const ENDPOINT = "https://xsignal.mykclawd.xyz/x-account-signals";
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

type XAccountSignalsResponse = {
  handle: string;
  userId: string;
  createdAt: string;
  signals: {
    activityByMonth: Record<string, number>;
    tweetCount: number;
    windowStart: string | null;
    windowEnd: string | null;
    windowCapped: boolean;
    windowCapNote: string | null;
    geo: {
      location: string | null;
      source: string | null;
    };
    usernameHistory: {
      previousUsernames: string[] | null;
    };
  };
};

function normalizeHandle(value: string) {
  return value.trim().replace(/^@+/, "");
}

function formatDate(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Something went wrong while paying and fetching account signals.";
}

function b64DecodeUtf8(b64: string) {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function b64EncodeUtf8(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

// x402 v2 handshake against the @x402/* server this endpoint runs on. thirdweb's
// built-in useFetchWithPayment still validates the legacy v1 requirements schema
// (maxAmountRequired / string resource), which this v2 server doesn't emit — so we
// drive the flow with @x402/evm directly and use the connected thirdweb wallet
// purely as the EIP-712 signer.
async function fetchWithX402Payment(url: string, account: Account): Promise<Response> {
  const initial = await fetch(url);
  if (initial.status !== 402) return initial;

  const requirementsHeader = initial.headers.get("payment-required");
  if (!requirementsHeader) {
    throw new Error("Server returned 402 without x402 payment requirements.");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paymentRequired: any = JSON.parse(b64DecodeUtf8(requirementsHeader));
  const requirement = paymentRequired.accepts?.find(
    (entry: { network?: string }) => entry.network === "eip155:8453",
  );
  if (!requirement) {
    throw new Error("Server did not offer a Base mainnet payment option.");
  }

  // Loaded on demand to keep the crypto bundle off the initial page render.
  const { ExactEvmScheme } = await import("@x402/evm/exact/client");
  const scheme = new ExactEvmScheme({
    address: account.address as `0x${string}`,
    signTypedData: (message) =>
      account.signTypedData(
        message as unknown as Parameters<Account["signTypedData"]>[0],
      ),
  });

  const { payload } = await scheme.createPaymentPayload(
    paymentRequired.x402Version,
    requirement,
  );

  const paymentHeader = b64EncodeUtf8(
    JSON.stringify({
      x402Version: paymentRequired.x402Version,
      accepted: requirement,
      payload,
    }),
  );

  return fetch(url, { headers: { "PAYMENT-SIGNATURE": paymentHeader } });
}

function ActivityGrid({ activityByMonth }: { activityByMonth: Record<string, number> }) {
  const months = Object.entries(activityByMonth).sort(([a], [b]) => a.localeCompare(b));
  const max = Math.max(...months.map(([, count]) => count), 1);

  if (months.length === 0) {
    return (
      <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
        No monthly activity returned.
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      {months.map(([month, count]) => (
        <div key={month} className="grid grid-cols-[4.75rem_1fr_2.5rem] items-center gap-3 text-sm">
          <span className="font-mono text-xs text-muted-foreground">{month}</span>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-chart-1"
              style={{ width: `${Math.max((count / max) * 100, count > 0 ? 8 : 0)}%` }}
            />
          </div>
          <span className="text-right font-mono text-xs tabular-nums">{count}</span>
        </div>
      ))}
    </div>
  );
}

export function X402Demo() {
  const account = useActiveAccount();
  const [isPending, setIsPending] = useState(false);
  const [handle, setHandle] = useState("vitalikbuterin");
  const [data, setData] = useState<XAccountSignalsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const normalizedHandle = normalizeHandle(handle);
  const canSubmit = Boolean(account?.address && normalizedHandle && !isPending);
  const previousUsernames = data?.signals.usernameHistory.previousUsernames?.filter(Boolean) ?? [];
  const requestUrl = useMemo(() => {
    if (!normalizedHandle) return ENDPOINT;
    return `${ENDPOINT}?handle=${encodeURIComponent(normalizedHandle)}`;
  }, [normalizedHandle]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setData(null);
    setIsPending(true);

    try {
      if (!account) throw new Error("Connect a wallet first.");
      const response = await fetchWithX402Payment(requestUrl, account);
      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `Request failed (${response.status}). ${body.slice(0, 200)}`,
        );
      }
      const result = (await response.json()) as XAccountSignalsResponse;
      setData(result);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <section className="rounded-xl border border-border/60 bg-card p-5 xl:sticky xl:top-6 xl:self-start">
      <div className="mb-5 flex flex-col gap-1">
        <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          Interactive demo
        </p>
        <h2 className="text-xl font-semibold tracking-tight">Run a paid lookup</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Connect a wallet on Base with at least $2.00 USDC, enter a handle, then sign the gasless payment authorization.
        </p>
      </div>

      <div className="mb-4">
        <ConnectButton
          client={thirdwebClient}
          chain={base}
          chains={[base]}
          connectButton={{ label: "Connect wallet" }}
          detailsButton={{ displayBalanceToken: { [base.id]: BASE_USDC } }}
          theme="light"
        />
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row xl:flex-col">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            @
          </span>
          <Input
            value={handle}
            onChange={(event) => setHandle(event.target.value)}
            placeholder="vitalikbuterin"
            className="h-10 pl-7"
            autoCapitalize="none"
            autoCorrect="off"
          />
        </div>
        <Button type="submit" disabled={!canSubmit} className="h-10 sm:min-w-28 xl:w-full">
          {isPending ? (
            <span className="inline-flex items-center gap-2">
              <span className="size-3 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
              Paying & fetching...
            </span>
          ) : (
            "Check"
          )}
        </Button>
      </form>

      {!account?.address ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Wallet required before the paid request can run.
        </p>
      ) : null}

      {error ? (
        <div className="mt-5 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-medium">Lookup failed</p>
          <p className="mt-1 leading-6">{error}</p>
        </div>
      ) : null}

      {data ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-border/60 bg-background/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Account</p>
                <h3 className="text-2xl font-semibold tracking-tight">@{data.handle}</h3>
                <p className="mt-1 font-mono text-xs text-muted-foreground">ID {data.userId}</p>
              </div>
              <div className="rounded-lg bg-muted/40 px-3 py-2 text-right">
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="text-sm font-medium">{formatDate(data.createdAt)}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <Stat label="Tweets fetched" value={data.signals.tweetCount.toLocaleString()} />
            <Stat
              label="Activity window"
              value={`${formatDate(data.signals.windowStart)} → ${formatDate(data.signals.windowEnd)}`}
            />
          </div>

          {data.signals.windowCapped ? (
            <div className="rounded-xl border border-chart-3/40 bg-chart-3/10 p-3 text-sm leading-6">
              This account has more activity beyond what was fetched.
              {data.signals.windowCapNote ? ` ${data.signals.windowCapNote}` : null}
            </div>
          ) : null}

          <div className="rounded-xl border border-border/60 bg-background/60 p-4">
            <h3 className="mb-3 font-medium">Activity by month</h3>
            <ActivityGrid activityByMonth={data.signals.activityByMonth} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <div className="rounded-xl border border-border/60 bg-background/60 p-4">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Geo</p>
              {data.signals.geo.location ? (
                <div className="mt-2">
                  <p className="font-medium">{data.signals.geo.location}</p>
                  {data.signals.geo.source ? (
                    <p className="mt-1 text-xs text-muted-foreground">Source: {data.signals.geo.source}</p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No location returned.</p>
              )}
            </div>

            <div className="rounded-xl border border-border/60 bg-background/60 p-4">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Previous usernames</p>
              {previousUsernames.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {previousUsernames.map((username) => (
                    <span
                      key={username}
                      className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs font-medium"
                    >
                      @{username}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No previous usernames returned.</p>
              )}
            </div>
          </div>

          <details className="rounded-xl border border-border/60 bg-background/60 p-4">
            <summary className={cn("cursor-pointer text-sm font-medium")}>Raw response</summary>
            <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-muted/40 p-3 text-xs leading-5">
              {JSON.stringify(data, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-4">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold leading-snug">{value}</p>
    </div>
  );
}
