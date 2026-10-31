"use client";

import { useEffect, useState } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cropImage, ImageTooLargeError } from "@/lib/crop-image";
import { toDecodable } from "@/lib/decode-image";
import { maxImageBytes } from "@/lib/image-upload";

const isGif = (file: File) => file.type === "image/gif";
// GIFs skip cropping and compression, so one over the limit can only be dropped
const isOversizedGif = (file: File) => isGif(file) && file.size > maxImageBytes;
const initialCrop: Point = { x: 0, y: 0 };

export function ImageCropDialog({
  files,
  aspect,
  cropShape = "rect",
  onComplete,
}: {
  files: File[];
  aspect: number;
  cropShape?: "rect" | "round";
  onComplete: (files: File[]) => void;
}) {
  const [queue, setQueue] = useState(files);
  // One entry per non-GIF file handled so far: its cropped file, or null when dropped
  const [outcomes, setOutcomes] = useState<(File | null)[]>([]);
  const [crop, setCrop] = useState(initialCrop);
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  // decoded is what the browser can draw: the file itself, or a JPEG made from a HEIC
  const [preview, setPreview] = useState<{
    file: File;
    decoded: File;
    url: string;
  }>();

  // A new files array starts a new queue
  if (queue !== files) {
    setQueue(files);
    setOutcomes([]);
    setCrop(initialCrop);
    setZoom(1);
    setArea(null);
  }

  const toCrop = files.filter((file) => !isGif(file));
  const current = toCrop.at(outcomes.length);

  useEffect(() => {
    if (files.some(isOversizedGif)) {
      toast.info("Images size need to be smaller than 5 MB.");
    }
    if (files.length > 0 && files.every(isGif)) {
      onComplete(files.filter((file) => !isOversizedGif(file)));
    }
    // Only a new queue should trigger this, not a new onComplete identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    let url: string | undefined;
    toDecodable(current).then(
      (decoded) => {
        if (cancelled) return;
        url = URL.createObjectURL(decoded);
        setPreview({ file: current, decoded, url });
      },
      () => {
        if (!cancelled) dropOnFailure();
      },
    );
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // A failure lands while current is unchanged, so this run's dropOnFailure is still the right one
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const advance = (outcome: File | null) => {
    const next = [...outcomes, outcome];
    setOutcomes(next);
    setCrop(initialCrop);
    setZoom(1);
    setArea(null);

    if (next.length === toCrop.length) {
      let index = 0;
      onComplete(
        files.flatMap((file) => {
          if (isGif(file)) return isOversizedGif(file) ? [] : [file];
          return next[index++] ?? [];
        }),
      );
    }
  };

  const dropOnFailure = () => {
    if (!current) return;
    toast.error(`Failed to crop ${current.name}`);
    advance(null);
  };

  const onApply = async () => {
    if (!current || !area || preview?.file !== current) return;
    setIsCropping(true);
    try {
      const cropped = await cropImage(preview.decoded, area);
      advance(cropped);
    } catch (error) {
      if (error instanceof ImageTooLargeError) {
        // Named after the picked file: the error names the decoded copy (IMG_0001.jpg for a HEIC)
        toast.error(`Couldn't shrink ${current.name} under 5 MB`);
        advance(null);
      } else {
        dropOnFailure();
      }
    } finally {
      setIsCropping(false);
    }
  };

  const onCancel = () => {
    if (!isCropping) advance(null);
  };

  return (
    <Dialog
      open={current !== undefined}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Crop image</DialogTitle>
          <DialogDescription>
            {toCrop.length > 1
              ? `Image ${(outcomes.length + 1).toString()} of ${toCrop.length.toString()}`
              : "Drag to reposition, pinch or scroll to zoom."}
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted relative h-72 overflow-hidden rounded-md sm:h-96">
          {/* Mount only once the preview matches the current file, so a stale image never reports a crop area */}
          {preview && preview.file === current ? (
            <Cropper
              image={preview.url}
              crop={crop}
              zoom={zoom}
              minZoom={1}
              maxZoom={3}
              aspect={aspect}
              cropShape={cropShape}
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, pixels) => setArea(pixels)}
              mediaProps={{ onError: dropOnFailure }}
            />
          ) : (
            <p className="text-muted-foreground grid h-full place-items-center text-sm">
              Preparing image…
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="h-11 sm:h-9"
            onClick={onCancel}
            disabled={isCropping}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="h-11 sm:h-9"
            onClick={() => void onApply()}
            disabled={!area || isCropping}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
