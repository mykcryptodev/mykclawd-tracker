"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
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
      {/* dome - front-facing arch */}
      <path d="M4 12C4 6 7 3 12 3C17 3 20 6 20 12" />
      {/* center crease */}
      <line x1="12" y1="3" x2="12" y2="12" />
      {/* button on top */}
      <circle cx="12" cy="3" r="1" fill="currentColor" stroke="none" />
      {/* brim - flat bill wider than dome, with slight curve */}
      <path d="M2 12H22Q22 15 20 15H4Q2 15 2 12Z" />
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
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <ThemeToggle />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
