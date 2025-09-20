"use client";

import ky, { HTTPError } from "ky";
import { toast } from "sonner";
import useSWR, { SWRConfiguration } from "swr";
import {
  BulletinMessage,
  BulletinMessageResponse,
} from "@/features/moments/models/responses";

function useMessages(config?: SWRConfiguration) {
  const key = "/api/moments/messages";
  const hook = useSWR<BulletinMessage[]>(
    key,
    async (url: string) => {
      const response = await ky.get(url).json<BulletinMessageResponse>();
      return response.messages;
    },
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
    messages: hook.data ?? [],
  };
}

export { useMessages };
export type { BulletinMessage };
