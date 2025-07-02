import type { Metadata } from "next";
import { playpenSans } from "@/components/ui/fonts";
import "@/app/globals.css";
import ThemeProviderWrapper from "@/components/providers/theme-provider";
import { TimeZoneProvider } from "@/components/providers/time-zone";
import { Toaster } from "@/components/providers/toaster";

export const metadata: Metadata = {
  title: "Ours",
  description: "A place for me and my girlfriend to record our lives.",
  applicationName: "Ours",
  keywords: [
    "ours",
    "twodo",
  ],
  authors: [
    {
      name: "CurlyTeddy",
      url: "https://github.com/CurlyTeddy",
    }
  ],
  generator: "Next.js",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${playpenSans.className} antialiased`}
      >
        <ThemeProviderWrapper>
          <TimeZoneProvider>
            <Toaster />
            {children}
          </TimeZoneProvider>
        </ThemeProviderWrapper>
      </body>
    </html>
  );
}
