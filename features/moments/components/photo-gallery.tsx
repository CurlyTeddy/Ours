"use client";

import { ChangeEventHandler, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Carousel,
  CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { usePhotos } from "@/features/moments/hooks/use-photos";
import { toast } from "sonner";
import ky from "ky";
import { PhotoUploadResponse } from "@/features/moments/models/responses";
import { PhotoUploadRequest } from "@/features/moments/models/requests";
import Autoplay from "embla-carousel-autoplay";
import AlertDialogButton from "@/components/ui/alert-dialog-button";
import { Skeleton } from "@/components/ui/skeleton";

function PhotoGallerySkeleton() {
  return (
    <Card className="flex-auto pb-0 overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl sm:text-2xl font-bold text-foreground">
            Photo Gallery
          </CardTitle>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-9 sm:w-20" />
            <Skeleton className="h-9 w-9 sm:w-20" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative aspect-[4/3] overflow-hidden bg-muted m-6 rounded-xl">
          <Skeleton className="w-full h-full" />
        </div>
      </CardContent>
    </Card>
  );
}

export function PhotoGallery() {
  const { key, photos, mutate: mutatePhotos, isLoading } = usePhotos();
  const [isUploading, startUploading] = useTransition();
  const [api, setApi] = useState<CarouselApi>();

  const plugin = useRef(
    Autoplay({ delay: 5000, stopOnInteraction: false, stopOnMouseEnter: true }),
  );
  const fileInput = useRef<HTMLInputElement>(null);

  const onPhotoUpload: ChangeEventHandler<HTMLInputElement> = (event) => {
    if (!event.target.files?.length) {
      return;
    }
    const files = Array.from(event.target.files);

    startUploading(async () => {
      try {
        await mutatePhotos(
          async () => {
            const { photos: newPhotos, uploadUrls } = await ky
              .post(key, {
                json: {
                  imageNames: files.map((file) => file.name),
                } satisfies PhotoUploadRequest,
              })
              .json<PhotoUploadResponse>();

            await Promise.all(
              uploadUrls.map((url, index) =>
                ky.put(url, {
                  headers: { "Content-Type": files[index].type },
                  body: files[index],
                }),
              ),
            );

            return photos.concat(newPhotos);
          },
          {
            revalidate: false,
          },
        );

        toast.success("Photos uploaded successfully!");
      } catch (error) {
        console.error("Upload failed:", error);
        toast.error("Failed to upload photos");
      }
    });
  };

  const onPhotoDelete = async () => {
    if (photos.length === 0 || api === undefined) {
      return;
    }

    const currentIndex = api.selectedScrollSnap();
    const newPhotos = photos.filter((_, index) => index !== currentIndex);
    await mutatePhotos(
      async () => {
        await ky.delete(`${key}/${photos[currentIndex].photoId}`);
        return newPhotos;
      },
      {
        optimisticData: newPhotos,
        rollbackOnError: true,
      },
    );
  };

  if (isLoading) {
    return <PhotoGallerySkeleton />;
  }

  return (
    <Card className="flex-auto pb-0 overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl sm:text-2xl font-bold text-foreground">
            Photo Gallery
          </CardTitle>
          <div className="flex gap-2">
            <input
              type="file"
              accept="image/*"
              onChange={onPhotoUpload}
              multiple
              className="hidden"
              ref={fileInput}
            />

            <Button
              variant="default"
              size="sm"
              disabled={photos.length === 10 || isUploading}
              className="bg-primary hover:bg-primary/90 cursor-pointer"
              onClick={() => fileInput.current?.click()}
            >
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">
                {isUploading ? "Uploading..." : "Upload"}
              </span>
            </Button>

            <AlertDialogButton
              buttonVariant="outline"
              buttonSize="sm"
              buttonClassName="cursor-pointer hover:text-destructive sm:flex"
              disabled={photos.length === 0}
              onConfirm={onPhotoDelete}
              onOpen={() => {
                plugin.current.stop();
              }}
              onClose={() => {
                plugin.current.play();
              }}
              confirmButtonVariant="destructive"
              alertTitle="Are you sure?"
              alertDescription="You will delete the current photo on carousel. The action cannot be undone."
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">Delete</span>
            </AlertDialogButton>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Carousel plugins={[plugin.current]} setApi={setApi}>
          {photos.length > 0 ? (
            <CarouselContent className="m-0">
              {photos.map((photo, index) => (
                <CarouselItem key={photo.photoId} className="p-0">
                  <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                    <Image
                      src={photo.imageUrl}
                      alt={photo.imageKey.substring(
                        0,
                        photo.imageKey.lastIndexOf("-"),
                      )}
                      fill
                      sizes="(max-width: 768px) 80vw, (max-width: 1200px) 60vw, 50vw"
                      className="object-cover"
                      priority={index === 0}
                    />
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
          ) : (
            <div className="aspect-[4/3] border-2 border-dashed border-muted-foreground/25 flex items-center justify-center bg-muted/50 m-6 rounded-xl">
              <div className="text-center p-8">
                <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground text-sm mb-2">
                  No photos yet. Upload some memories!
                </p>
              </div>
            </div>
          )}
          {photos.length > 1 && (
            <>
              <CarouselPrevious className="left-4 bg-white/80 hover:bg-white border-0 shadow-md" />
              <CarouselNext className="right-4 bg-white/80 hover:bg-white border-0 shadow-md" />
            </>
          )}
        </Carousel>
      </CardContent>
    </Card>
  );
}
