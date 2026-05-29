import type { ReactNode } from "react"
import { CircleHelpIcon } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { SyncButton } from "@/components/sync-button"
import { LocalDateTime } from "@/components/local-datetime"

interface Props {
  address?: string
  /** Unix timestamp (seconds). When provided, rendered in the user's local timezone. */
  asOfTs?: number | null
  /** Fallback plain string when asOfTs is not available. */
  asOf?: string
  title?: string
  /** When set, a circle-help icon links here (e.g. article) next to the title. */
  titleHelpHref?: string
  titleHelpLabel?: string
  variant?: "full" | "minimal"
  /** Replaces the default GitHub-Actions SyncButton (e.g. the page's own sync control). */
  syncSlot?: ReactNode
}

export function SiteHeader({
  address = "",
  asOfTs,
  asOf = "—",
  title = "PnL Tracker",
  titleHelpHref,
  titleHelpLabel = "Read article",
  variant = "full",
  syncSlot,
}: Props) {
  const full = variant === "full"
  const showMeta = full && address.length >= 10

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b border-border/60 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 h-4 data-vertical:self-auto"
        />
        <div className="flex shrink-0 items-center gap-1">
          <h1 className="text-sm font-medium tracking-tight">{title}</h1>
          {titleHelpHref ? (
            <a
              href={titleHelpHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground -m-0.5 rounded-sm p-0.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label={titleHelpLabel}
            >
              <CircleHelpIcon className="size-4" aria-hidden />
            </a>
          ) : null}
        </div>
        {showMeta && (
          <span className="hidden sm:block text-[11px] text-muted-foreground font-mono ml-2 truncate">
            {address.slice(0, 6)}…{address.slice(-4)}
          </span>
        )}
        {full && (asOfTs != null || asOf !== "—") && (
          <span className="hidden md:block text-[11px] text-muted-foreground ml-1">
            · {asOfTs != null ? <LocalDateTime ts={asOfTs} /> : asOf}
          </span>
        )}
        {full && (
          <div className="ml-auto">
            {syncSlot ?? <SyncButton />}
          </div>
        )}
      </div>
    </header>
  )
}
