import type { Metadata } from "next";
import { playpenSans } from "@/components/ui/fonts";
import "@/app/globals.css";
import ThemeProviderWrapper from "@/components/providers/theme-provider";
import { TimeZoneProvider } from "@/components/providers/time-zone";
import { Toaster } from "@/components/providers/toaster";
import { UserProvider } from "@/components/providers/user";
import { auth } from "@/features/auth/auth";

export const metadata: Metadata = {
  title: "Ours",
  description: "A place for me and my girlfriend to record our lives.",
  applicationName: "Ours",
  keywords: ["ours", "twodo"],
  authors: [
    {
      name: "CurlyTeddy",
      url: "https://github.com/CurlyTeddy",
    },
  ],
  generator: "Next.js",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = (await auth())?.user;

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${playpenSans.className} antialiased`}>
        <ThemeProviderWrapper>
          <TimeZoneProvider>
            <UserProvider user={user}>
              <Toaster />
              {children}
            </UserProvider>
          </TimeZoneProvider>
        </ThemeProviderWrapper>
      </body>
    </html>
  );
}
