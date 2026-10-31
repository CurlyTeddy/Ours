import type { Area } from "react-easy-crop";
import { maxImageBytes } from "@/lib/image-upload";

// iOS Safari refuses canvases over 16,777,216 pixels, which a 24 MP photo exceeds
export const maxCanvasPixels = 16_777_216;
const minLongEdge = 1600;
const keepTypes = ["image/jpeg", "image/png", "image/webp"];

export class ImageTooLargeError extends Error {
  name = "ImageTooLargeError";
}

export function encodeCanvas(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Failed to encode image")),
      type,
      quality,
    ),
  );
}

// The extension follows the encoded type, so a stored name never claims HEIC for a JPEG.
export function renameToType(name: string, type: string): string {
  const extension = type === "image/jpeg" ? "jpg" : type.replace("image/", "");
  return `${name.replace(/\.[^.]*$/, "")}.${extension}`;
}

export async function cropImage(file: File, area: Area): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`Failed to load ${file.name}`));
    });

    const draw = (longEdge: number, opaque: boolean) => {
      const scale = longEdge / Math.max(area.width, area.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(area.width * scale));
      canvas.height = Math.max(1, Math.floor(area.height * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Canvas 2D context is unavailable");
      }
      // JPEG has no alpha, and transparent pixels would otherwise encode black
      if (opaque) {
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      context.drawImage(
        image,
        area.x,
        area.y,
        area.width,
        area.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      return canvas;
    };

    const fullLongEdge =
      Math.max(area.width, area.height) *
      Math.min(1, Math.sqrt(maxCanvasPixels / (area.width * area.height)));
    const firstType = keepTypes.includes(file.type) ? file.type : "image/jpeg";
    const steps = [
      { longEdge: fullLongEdge, type: firstType, qualities: [0.92] },
      {
        longEdge: fullLongEdge,
        type: "image/jpeg",
        qualities: [0.8, 0.7, 0.6],
      },
    ];
    // Halve down to 1600 px; crops already at or under 1600 px are never upscaled
    for (let longEdge = fullLongEdge; longEdge > minLongEdge; ) {
      longEdge = Math.max(minLongEdge, Math.floor(longEdge / 2));
      steps.push({
        longEdge,
        type: "image/jpeg",
        qualities: [0.92, 0.8, 0.7, 0.6],
      });
    }

    for (const { longEdge, type, qualities } of steps) {
      const canvas = draw(longEdge, type === "image/jpeg");
      for (const quality of qualities) {
        const blob = await encodeCanvas(canvas, type, quality);
        if (blob.size <= maxImageBytes) {
          return new File([blob], renameToType(file.name, blob.type), {
            type: blob.type,
          });
        }
      }
    }
    throw new ImageTooLargeError(`Couldn't shrink ${file.name} under 5 MB`);
  } finally {
    URL.revokeObjectURL(url);
  }
}
