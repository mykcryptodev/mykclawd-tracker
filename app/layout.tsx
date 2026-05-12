import type { Metadata } from "next";
import localFont from "next/font/local";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Providers } from "@/components/providers";
import "./globals.css";
import "react-tweet/theme.css";

const segment = localFont({
  variable: "--font-segment",
  src: [
    {
      path: "../public/fonts/Segment/Segment-Medium.otf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../public/fonts/Segment/Segment-Bold.otf",
      weight: "700",
      style: "normal",
    },
  ],
  display: "swap",
});

export const metadata: Metadata = {
  title: "PnL Tracker",
  description: "On-chain PnL tracker for Base network",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${segment.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          <TooltipProvider>{children}</TooltipProvider>
        </Providers>
      </body>
    </html>
  );
}
