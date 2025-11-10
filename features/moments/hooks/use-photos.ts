"use client";

import ky, { HTTPError } from "ky";
import { toast } from "sonner";
import useSWR, { SWRConfiguration } from "swr";
import { PhotoResponse } from "@/features/moments/models/responses";

function usePhotos(config?: SWRConfiguration) {
  const key = "/api/moments/photos";
  const hook = useSWR(
    key,
    async (url: string) => {
      const response = await ky.get(url).json<PhotoResponse>();
      return response.photos.map((photo) => ({
        photoId: photo.photoId,
        imageKey: photo.imageKey,
        imageUrl: photo.imageUrl,
        createdAt: photo.createdAt,
      }));
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
    ...hook,
    key,
    photos: hook.data ?? [],
  };
}

export { usePhotos };
