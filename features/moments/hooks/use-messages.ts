"use client";

import ky, { HTTPError } from "ky";
import { toast } from "sonner";
import useSWRInfinite, { SWRInfiniteConfiguration } from "swr/infinite";
import {
  BulletinMessage,
  BulletinMessageResponse,
} from "@/features/moments/models/responses";

function useMessages(limit = 5, config?: SWRInfiniteConfiguration) {
  const hook = useSWRInfinite<BulletinMessageResponse>(
    (_, previousPageData: BulletinMessageResponse | null) => {
      if (previousPageData && !previousPageData.nextCursor) {
        return null;
      }
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (previousPageData?.nextCursor) {
        params.set("cursor", previousPageData.nextCursor);
      }
      return `/api/moments/messages?${params.toString()}`;
    },
    async (url: string) => {
      return ky.get(url).json<BulletinMessageResponse>();
    },
    {
      errorRetryCount: 1,
      revalidateFirstPage: false,
      onError: (error: HTTPError) => {
        toast.error(error.message);
      },
      ...config,
    },
  );

  const pages = hook.data ?? [];
  const messages = pages.flatMap((page) => page.messages);
  const hasMore =
    pages.length > 0 && pages[pages.length - 1].nextCursor !== null;

  return {
    ...hook,
    messages,
    hasMore,
    isLoadingMore:
      hook.isValidating && hook.data && hook.data.length !== hook.size,
  };
}

export { useMessages };
export type { BulletinMessage };
