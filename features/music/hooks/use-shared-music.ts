"use client";

import ky, { HTTPError } from "ky";
import useSWR, { SWRConfiguration } from "swr";
import { toast } from "sonner";
import { MusicResponse } from "@/features/music/models/responses";
import { useUser } from "@/features/profile/hooks/user";

function useSharedMusic(config?: SWRConfiguration) {
  const key = "/api/music";
  const { user, isLoading: isUserLoading } = useUser();
  const hook = useSWR<MusicResponse>(
    key,
    async (url: string) => ky.get(url).json<MusicResponse>(),
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
    user,
    isLoading: hook.isLoading || isUserLoading,
    mine:
      hook.data?.shared.find((music) => music.selectedById === user?.id) ??
      null,
    shared: hook.data?.shared ?? [],
  };
}

export { useSharedMusic };
