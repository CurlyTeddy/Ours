"use client";

import ky, { HTTPError } from "ky";
import { toast } from "sonner";
import useSWR, { SWRConfiguration } from "swr";
import { SpecialDayResponse } from "@/features/moments/models/responses";

function useSpecialDays(config?: SWRConfiguration) {
  const key = "/api/moments/special-days";
  const hook = useSWR(
    key,
    async (url: string) =>
      (await ky.get(url).json<SpecialDayResponse>()).specialDays,
    {
      errorRetryCount: 1,
      onError: (error: HTTPError) => {
        toast.error(error.message);
      },
      ...config,
    },
  );

  return {
    ...hook,
    key,
    specialDays: hook.data ?? [],
  };
}

export { useSpecialDays };
