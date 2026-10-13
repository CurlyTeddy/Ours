import type { Area } from "react-easy-crop";

export async function cropImage(file: File, area: Area): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`Failed to load ${file.name}`));
    });

    // iOS Safari refuses canvases over 16,777,216 pixels, which a 24 MP photo exceeds
    const scale = Math.min(
      1,
      Math.sqrt(16_777_216 / (area.width * area.height)),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(area.width * scale);
    canvas.height = Math.floor(area.height * scale);
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2D context is unavailable");
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

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, file.type, 0.92),
    );
    if (!blob) {
      throw new Error(`Failed to encode ${file.name}`);
    }
    return new File([blob], file.name, { type: blob.type });
  } finally {
    URL.revokeObjectURL(url);
  }
}
