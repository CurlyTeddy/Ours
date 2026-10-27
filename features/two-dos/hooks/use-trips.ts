"use client";

import ky, { HTTPError } from "ky";
import { toast } from "sonner";
import useSWR, { SWRConfiguration } from "swr";
import type { TripDto, TripsResponse } from "@/features/two-dos/models/trip";

function useTrips(config?: SWRConfiguration) {
  const key = "/api/trips";
  const hook = useSWR<TripDto[]>(
    key,
    async (url: string) => (await ky.get(url).json<TripsResponse>()).trips,
    {
      errorRetryCount: 1,
      onError: (error: HTTPError) => {
        toast.error(error.message);
      },
      ...config,
    },
  );

  return {
    key,
    ...hook,
    trips: hook.data ?? [],
  };
}

export { useTrips };
