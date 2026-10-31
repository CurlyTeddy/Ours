import { encodeCanvas, maxCanvasPixels, renameToType } from "@/lib/crop-image";

// Chrome on Windows can give a HEIC file an empty type, so the name counts too.
export function isHeic(file: File): boolean {
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    /\.hei[cf]$/i.test(file.name)
  );
}

async function decodeHeic(file: File): Promise<File> {
  // Loaded only here, so the multi-MB WASM bundle never reaches browsers that decode HEIC natively
  const { default: createLibheif } = await import(
    "libheif-js/libheif-wasm/libheif-bundle.mjs"
  );
  const images = new (createLibheif().HeifDecoder)().decode(
    new Uint8Array(await file.arrayBuffer()),
  );
  try {
    const image = images.find((each) => each.is_primary()) ?? images.at(0);
    if (!image) {
      throw new Error(`Failed to decode ${file.name}`);
    }
    const width = image.get_width();
    const height = image.get_height();
    const pixels = await new Promise<ImageData>((resolve, reject) =>
      image.display(new ImageData(width, height), (data) =>
        data
          ? resolve(data)
          : reject(new Error(`Failed to decode ${file.name}`)),
      ),
    );

    // Resized as a bitmap, so no canvas ever exceeds the cap (iOS Safari before 17 has no native HEIC)
    const scale = Math.min(1, Math.sqrt(maxCanvasPixels / (width * height)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(width * scale);
    canvas.height = Math.floor(height * scale);
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2D context is unavailable");
    }
    const bitmap = await createImageBitmap(pixels, {
      resizeWidth: canvas.width,
      resizeHeight: canvas.height,
      resizeQuality: "high",
    });
    context.drawImage(bitmap, 0, 0);
    bitmap.close();

    const blob = await encodeCanvas(canvas, "image/jpeg", 0.92);
    return new File([blob], renameToType(file.name, blob.type), {
      type: blob.type,
    });
  } finally {
    images.forEach((each) => each.free());
  }
}

// Only HEIC is probed: decoding every photo just to test it would cost a full extra decode.
// A broken non-HEIC file still gets dropped by the Cropper's onError or by cropImage.
export async function toDecodable(file: File): Promise<File> {
  if (!isHeic(file)) return file;
  try {
    // Safari decodes HEIC natively
    (await createImageBitmap(file)).close();
    return file;
  } catch {
    return decodeHeic(file);
  }
}
