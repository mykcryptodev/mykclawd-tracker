"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
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
  HomeIcon,
  ServerIcon,
} from "lucide-react"

function BaseballCapIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* brim */}
      <path d="M3 15c0 0 2 2 9 2s11-3 11-3" />
      {/* cap dome */}
      <path d="M3 15 C3 8 7 4 12 4 C17 4 21 8 21 14" />
      {/* crown seam */}
      <path d="M12 4 L12 10" />
      {/* brim underside */}
      <path d="M3 15 Q1 15 1 17 Q1 19 3 19 L14 17" />
    </svg>
  )
}

const navMain = [
  { title: "Home", url: "/", icon: <HomeIcon /> },
  { title: "Portfolio", url: "/pnl", icon: <LayoutDashboardIcon /> },
  { title: "Aero LP", url: "/aero", icon: <DropletsIcon /> },
  { title: "Hat Tap", url: "/hat", icon: <BaseballCapIcon /> },
  { title: "Server Health", url: "/health", icon: <ServerIcon /> },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:gap-2 data-[slot=sidebar-menu-button]:p-1.5!"
              render={<Link href="/" />}
            >
              <Image
                src="/images/mykclawd.jpg"
                alt=""
                width={24}
                height={24}
                className="size-6 shrink-0 rounded-[30%] object-cover"
                priority
              />
              <span className="text-base font-[family-name:var(--font-segment)] tracking-tight">
                myk_clawd
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
                    render={<Link href={item.url} />}
                  >
                    {item.icon}
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
