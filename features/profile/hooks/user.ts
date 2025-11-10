"use client";

import useSWR, { SWRConfiguration } from "swr";
import ky, { HTTPError } from "ky";
import { toast } from "sonner";
import { HttpErrorPayload } from "@/lib/error";
import { Profile } from "@/features/profile/models/responses";

export function useUser(config?: SWRConfiguration) {
  const {
    data: user,
    error,
    isLoading,
    mutate,
  } = useSWR<Profile, HTTPError<HttpErrorPayload>>(
    "/api/profile",
    async (url: string) => await ky.get<Profile>(url).json(),
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000,
      shouldRetryOnError: false,
      onError: (error) => {
        toast.error(error.message);
      },
      ...config,
    },
  );

  return {
    user: error ? null : user,
    isLoading,
    mutate,
  };
}
