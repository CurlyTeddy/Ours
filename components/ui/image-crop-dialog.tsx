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
import { cropImage } from "@/lib/crop-image";

const isGif = (file: File) => file.type === "image/gif";
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
  const [preview, setPreview] = useState<{ file: File; url: string }>();

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
    if (files.length > 0 && files.every(isGif)) {
      onComplete(files);
    }
    // Only a new queue should trigger this, not a new onComplete identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  useEffect(() => {
    if (!current) return;
    const url = URL.createObjectURL(current);
    setPreview({ file: current, url });
    return () => URL.revokeObjectURL(url);
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
        files.flatMap((file) => (isGif(file) ? [file] : (next[index++] ?? []))),
      );
    }
  };

  const dropOnFailure = () => {
    if (!current) return;
    toast.error(`Failed to crop ${current.name}`);
    advance(null);
  };

  const onApply = async () => {
    if (!current || !area) return;
    setIsCropping(true);
    try {
      const cropped = await cropImage(current, area);
      advance(cropped);
    } catch {
      dropOnFailure();
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
          ) : null}
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
