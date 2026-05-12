import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { SyncButton } from "@/components/sync-button"

interface Props {
  address: string
  asOf: string
}

export function SiteHeader({ address, asOf }: Props) {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b border-border/60 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 h-4 data-vertical:self-auto"
        />
        <h1 className="text-sm font-medium tracking-tight shrink-0">PnL Tracker</h1>
        <span className="hidden sm:block text-[11px] text-muted-foreground font-mono ml-2 truncate">
          {address.slice(0, 6)}…{address.slice(-4)}
        </span>
        {asOf !== "—" && (
          <span className="hidden md:block text-[11px] text-muted-foreground ml-1">
            · {asOf}
          </span>
        )}
        <div className="ml-auto">
          <SyncButton />
        </div>
      </div>
    </header>
  )
}
