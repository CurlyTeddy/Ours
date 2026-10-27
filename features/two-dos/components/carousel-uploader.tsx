"use client";

import { maxFileSize, Todo, TodoForm } from "@/features/two-dos/models/views";
import { ControllerRenderProps } from "react-hook-form";
import {
  useEffect,
  useState,
  useRef,
  useImperativeHandle,
  ChangeEvent,
  useMemo,
} from "react";
import {
  FormItem,
  FormLabel,
  FormMessage,
  FormControl,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  CarouselApi,
} from "@/components/ui/carousel";
import { Upload, Trash2 } from "lucide-react";
import Image from "next/image";
import AlertDialogButton from "@/components/ui/alert-dialog-button";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";
import { toast } from "sonner";

function CarouselUploader({
  existingImages,
  onExistingImagesChange,
  field,
  isPending,
}: {
  existingImages: Todo["images"];
  onExistingImagesChange: (images: Todo["images"]) => void;
  field: ControllerRenderProps<TodoForm, "images">;
  isPending: boolean;
}) {
  const [api, setApi] = useState<CarouselApi>();
  const fileInput = useRef<HTMLInputElement>(null);
  const [filesToCrop, setFilesToCrop] = useState<File[]>([]);
  const { value: newImages, ref, onChange, ...rest } = field;
  useImperativeHandle(ref, () => fileInput.current);

  // Only new uploads need object URLs — existing images use their pre-signed URLs directly
  const newImagePreviews = useMemo(() => {
    return newImages.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
  }, [newImages]);

  useEffect(() => {
    return () =>
      newImagePreviews.forEach((image) => URL.revokeObjectURL(image.preview));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalCount = existingImages.length + newImages.length;

  const onImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length) {
      return;
    }

    const uploadedFiles = Array.from(event.target.files);
    // Lets the same file be picked again
    event.target.value = "";

    if (totalCount + uploadedFiles.length > 5) {
      toast.info("A twodo can only have at most five images.");
      return;
    }

    if (!uploadedFiles.every((image) => image.size <= maxFileSize)) {
      toast.info("Images size need to be smaller than 5 MB.");
      return;
    }

    setFilesToCrop(uploadedFiles);
  };

  const onCropComplete = (croppedFiles: File[]) => {
    setFilesToCrop([]);
    if (croppedFiles.length === 0) {
      return;
    }
    onChange([...newImages, ...croppedFiles]);
    toast.success("Image uploaded successfully!");
  };

  const onImageDelete = () => {
    if (totalCount === 0 || api === undefined) {
      return;
    }

    const currentIndex = api.selectedScrollSnap();

    if (currentIndex < existingImages.length) {
      onExistingImagesChange(
        existingImages.filter((_, index) => index !== currentIndex),
      );
    } else {
      const newIndex = currentIndex - existingImages.length;
      URL.revokeObjectURL(newImagePreviews[newIndex].preview);
      onChange(newImages.filter((_, index) => index !== newIndex));
    }
    toast.success("Image deleted successfully!");
  };

  const hasImages = totalCount > 0;

  return (
    <FormItem>
      <div className="flex items-center justify-between">
        <FormLabel>Images</FormLabel>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={isPending}
            className="bg-primary hover:bg-primary/90 cursor-pointer"
            onClick={() => fileInput.current?.click()}
          >
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Upload</span>
          </Button>

          <AlertDialogButton
            buttonVariant="outline"
            buttonSize="sm"
            buttonClassName="cursor-pointer hover:text-destructive sm:flex"
            disabled={!hasImages || isPending}
            onConfirm={onImageDelete}
            alertTitle="Are you sure?"
            alertDescription="You will delete the current image. The action cannot be undone."
          >
            <Trash2 className="h-4 w-4" />
            <span className="hidden sm:inline">Delete</span>
          </AlertDialogButton>
        </div>
      </div>
      <FormControl>
        <Input
          type="file"
          accept="image/*"
          className="hidden"
          ref={fileInput}
          onChange={onImageUpload}
          multiple
          disabled={isPending}
          {...rest}
        />
      </FormControl>
      <Carousel setApi={setApi}>
        {hasImages ? (
          <CarouselContent className="m-0">
            {existingImages.map((image) => (
              <CarouselItem key={image.key} className="p-0">
                <div className="relative aspect-4/3 overflow-hidden bg-muted rounded-lg">
                  <Image
                    src={image.url}
                    alt={image.key}
                    fill
                    sizes="(max-width: 768px) 80vw, (max-width: 1200px) 60vw, 50vw"
                    className="object-cover"
                  />
                </div>
              </CarouselItem>
            ))}
            {newImagePreviews.map((image, index) => (
              <CarouselItem key={image.file.name} className="p-0">
                <div className="relative aspect-4/3 overflow-hidden bg-muted rounded-lg">
                  <Image
                    src={image.preview}
                    alt={image.file.name}
                    fill
                    sizes="(max-width: 768px) 80vw, (max-width: 1200px) 60vw, 50vw"
                    className="object-cover"
                    priority={index === 0 && existingImages.length === 0}
                  />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
        ) : (
          <div className="aspect-4/3 border-2 border-dashed border-muted-foreground/25 flex items-center justify-center bg-muted/50 rounded-xl">
            <div className="text-center p-8">
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground text-sm mb-2">
                No images yet. Upload at most five images!
              </p>
            </div>
          </div>
        )}
        {totalCount > 1 && (
          <>
            <CarouselPrevious
              className="left-4 bg-white/80 hover:bg-white border-0 shadow-md"
              type="button"
            />
            <CarouselNext
              className="right-4 bg-white/80 hover:bg-white border-0 shadow-md"
              type="button"
            />
          </>
        )}
      </Carousel>
      <FormMessage />
      <ImageCropDialog
        files={filesToCrop}
        aspect={4 / 3}
        onComplete={onCropComplete}
      />
    </FormItem>
  );
}

export { CarouselUploader };
