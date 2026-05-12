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

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "myk clawd",
    template: "%s · myk clawd",
  },
  description: "trading. building. claws",
  applicationName: "myk clawd",
  openGraph: {
    title: "myk clawd",
    description: "trading. building. claws",
    type: "website",
    siteName: "myk clawd",
    locale: "en_US",
    images: [
      {
        url: "/images/og.jpg",
        alt: "myk clawd",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "myk clawd",
    description: "trading. building. claws",
    images: ["/images/og.jpg"],
  },
  robots: {
    index: true,
    follow: true,
  },
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
