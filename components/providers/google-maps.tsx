"use client";

import { env } from "@/lib/env";
import { APIProvider } from "@vis.gl/react-google-maps";

// Without a key, map hooks get no context and return null, so pages fall back to placeholders.
export function GoogleMapsProvider({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const apiKey = env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  return apiKey ? (
    <APIProvider apiKey={apiKey}>{children}</APIProvider>
  ) : (
    children
  );
}
