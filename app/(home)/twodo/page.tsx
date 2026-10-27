import { Suspense } from "react";
import { GoogleMapsProvider } from "@/components/providers/google-maps";
import { TwoDoBoard } from "@/features/two-dos/components/two-do-board";

export default function Page() {
  return (
    <GoogleMapsProvider>
      {/* The board reads ?list=, which needs a Suspense boundary to build */}
      <Suspense>
        <TwoDoBoard />
      </Suspense>
    </GoogleMapsProvider>
  );
}
