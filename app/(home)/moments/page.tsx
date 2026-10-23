import { GoogleMapsProvider } from "@/components/providers/google-maps";
import { MomentsWall } from "@/features/moments/components/moments-wall";

export default function Page() {
  return (
    <GoogleMapsProvider>
      <MomentsWall />
    </GoogleMapsProvider>
  );
}
