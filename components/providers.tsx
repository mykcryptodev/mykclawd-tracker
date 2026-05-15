"use client";

import { ThirdwebProvider } from "thirdweb/react";
import { ThemeProvider } from "next-themes";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="mykclawd-theme-v2">
      <ThirdwebProvider>{children}</ThirdwebProvider>
    </ThemeProvider>
  );
}
