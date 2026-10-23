"use client";

import ky, { HTTPError } from "ky";
import { toast } from "sonner";
import useSWR, { SWRConfiguration } from "swr";
import { NoteListResponse } from "@/features/moments/models/responses";

function useNotes(config?: SWRConfiguration) {
  const key = "/api/moments/notes";
  const hook = useSWR(
    key,
    async (url: string) => (await ky.get(url).json<NoteListResponse>()).notes,
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
    notes: hook.data ?? [],
  };
}

export { useNotes };
