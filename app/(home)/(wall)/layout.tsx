import { Suspense } from "react";
import { GoogleMapsProvider } from "@/components/providers/google-maps";
import { MomentsWall } from "@/features/moments/components/moments-wall";

// One wall for /moments and /map, so switching tabs animates instead of remounting.
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <GoogleMapsProvider>
      {/* The wall reads ?layer=, which needs a Suspense boundary to build */}
      <Suspense>
        <MomentsWall />
      </Suspense>
      {children}
    </GoogleMapsProvider>
  );
}
