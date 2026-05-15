"use client";

import { ThirdwebProvider } from "thirdweb/react";
import { ThemeProvider } from "next-themes";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <ThirdwebProvider>{children}</ThirdwebProvider>
    </ThemeProvider>
  );
}
