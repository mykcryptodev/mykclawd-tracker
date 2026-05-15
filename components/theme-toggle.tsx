"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { SunIcon, MoonIcon } from "lucide-react";
import { SidebarMenuButton } from "@/components/ui/sidebar";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <SidebarMenuButton className="w-full">
        <span className="size-4" />
        <span>Toggle theme</span>
      </SidebarMenuButton>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <SidebarMenuButton
      onClick={() => setTheme(isDark ? "light" : "dark")}
      tooltip={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="w-full"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </SidebarMenuButton>
  );
}
