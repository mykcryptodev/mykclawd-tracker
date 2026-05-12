"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { NavSecondary } from "@/components/nav-secondary"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  LayoutDashboardIcon,
  DropletsIcon,
  Settings2Icon,
  CircleHelpIcon,
  HomeIcon,
} from "lucide-react"

const navSecondary = [
  {
    title: "Settings",
    url: "#",
    icon: <Settings2Icon />,
  },
  {
    title: "Get Help",
    url: "#",
    icon: <CircleHelpIcon />,
  },
]

const navMain = [
  { title: "home", url: "/", icon: <HomeIcon /> },
  { title: "PnL", url: "/pnl", icon: <LayoutDashboardIcon /> },
  { title: "Aero LP", url: "/aero", icon: <DropletsIcon /> },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<a href="/" />}
            >
              <span className="text-base font-[family-name:var(--font-segment)] tracking-tight">
                PnL
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navMain.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    isActive={pathname === item.url}
                    tooltip={item.title}
                    render={<a href={item.url} />}
                  >
                    {item.icon}
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
    </Sidebar>
  )
}
