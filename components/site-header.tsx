import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { SyncButton } from "@/components/sync-button"

interface Props {
  address: string
  asOf: string
}

export function SiteHeader({ address, asOf }: Props) {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 h-4 data-vertical:self-auto"
        />
        <h1 className="text-base font-medium shrink-0">PnL Tracker</h1>
        <span className="hidden sm:block text-xs text-muted-foreground font-mono ml-2 truncate">
          {address.slice(0, 10)}…{address.slice(-6)}
        </span>
        <span className="hidden md:block text-xs text-muted-foreground ml-1">
          · as of {asOf}
        </span>
        <div className="ml-auto">
          <SyncButton />
        </div>
      </div>
    </header>
  )
}
