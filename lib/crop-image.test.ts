import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Area } from "react-easy-crop";
import { cropImage, ImageTooLargeError } from "@/lib/crop-image";
import { maxImageBytes } from "@/lib/image-upload";

// jsdom never decodes images and has no canvas, so both are stubbed here.
let loadOutcome: "load" | "error" = "load";
let blobOutcome: "blob" | "null" = "blob";
const supportedTypes = ["image/jpeg", "image/png", "image/webp"];

interface Attempt {
  width: number;
  height: number;
  type: string;
  quality: number | undefined;
}
// Each toBlob call, with the canvas size at that moment.
const attempts: Attempt[] = [];
// Decides each encoded blob's byte size; defaults to something tiny.
let blobSize: (attempt: Attempt) => number = () => 1000;

const ctx = {
  fillStyle: "#000000" as string,
  drawImage: vi.fn(),
  fillRect: vi.fn(),
  // White fills seen, recorded with the fill colour at the time
  fills: [] as { style: string; args: number[] }[],
};
const srcDescriptor = Object.getOwnPropertyDescriptor(
  HTMLImageElement.prototype,
  "src",
);

beforeEach(() => {
  loadOutcome = "load";
  blobOutcome = "blob";
  attempts.length = 0;
  blobSize = () => 1000;
  ctx.fillStyle = "#000000";
  ctx.fills = [];
  ctx.drawImage.mockClear();
  ctx.fillRect.mockReset();
  ctx.fillRect.mockImplementation((...args: number[]) => {
    ctx.fills.push({ style: String(ctx.fillStyle), args });
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:source");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  Object.defineProperty(HTMLImageElement.prototype, "src", {
    configurable: true,
    get(this: HTMLImageElement) {
      return this.getAttribute("src") ?? "";
    },
    set(this: HTMLImageElement, value: string) {
      this.setAttribute("src", value);
      setTimeout(() => this.dispatchEvent(new Event(loadOutcome)), 0);
    },
  });
  HTMLImageElement.prototype.decode = function () {
    return loadOutcome === "load"
      ? Promise.resolve()
      : Promise.reject(new Error("decode failed"));
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
    type?: string,
    quality?: number,
  ) {
    // Like a browser: unsupported types fall back to PNG.
    const outType = type && supportedTypes.includes(type) ? type : "image/png";
    const attempt = {
      width: this.width,
      height: this.height,
      type: outType,
      quality,
    };
    attempts.push(attempt);
    const size = blobSize(attempt);
    setTimeout(() => {
      if (blobOutcome === "null") {
        callback(null);
        return;
      }
      const blob = new Blob(["pixels"], { type: outType });
      // A real multi-MB buffer per attempt would be slow; only the size matters.
      Object.defineProperty(blob, "size", { value: size });
      callback(blob);
    }, 0);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  if (srcDescriptor) {
    Object.defineProperty(HTMLImageElement.prototype, "src", srcDescriptor);
  }
});

const area: Area = { x: 10, y: 20, width: 400, height: 300 };
const big: Area = { x: 0, y: 0, width: 4000, height: 3000 };
const file = (name = "photo.jpg", type = "image/jpeg") =>
  new File(["source"], name, { type });
const over = maxImageBytes + 1;
const summary = () =>
  attempts.map(({ width, height, type, quality }) => [
    width,
    height,
    type,
    quality,
  ]);
const ladder = (width: number, height: number, qualities: number[]) =>
  qualities.map((quality) => [width, height, "image/jpeg", quality]);
const isWhite = (style: string) =>
  /^(#fff|#ffffff|white|rgb\(255,\s*255,\s*255\)|rgba\(255,\s*255,\s*255,\s*1\))$/i.test(
    style.trim(),
  );

describe("R3: output type", () => {
  test("a JPEG that fits is encoded once as JPEG at 0.92", async () => {
    const result = await cropImage(file(), area);

    expect(result).toBeInstanceOf(File);
    expect(result.type).toBe("image/jpeg");
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledTimes(1);
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      "image/jpeg",
      0.92,
    );
  });

  test.each(["image/png", "image/webp"])(
    "%s that fits keeps its type at 0.92",
    async (type) => {
      const result = await cropImage(file("pic", type), area);

      expect(result.type).toBe(type);
      expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledTimes(1);
      expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(
        expect.any(Function),
        type,
        0.92,
      );
    },
  );

  test.each(["image/heic", "image/heif", "image/bmp", "", "image/gif"])(
    "type %j is encoded as JPEG from the first attempt",
    async (type) => {
      const result = await cropImage(file("IMG_0001.HEIC", type), area);

      expect(result.type).toBe("image/jpeg");
      expect(
        vi.mocked(HTMLCanvasElement.prototype.toBlob).mock.calls[0],
      ).toEqual([expect.any(Function), "image/jpeg", 0.92]);
    },
  );

  test("never asks the canvas for WebP when the source is not WebP", async () => {
    blobSize = (a) => (a.quality === 0.92 ? over : 1000);
    await cropImage(file("big.png", "image/png"), big);

    expect(attempts.map((a) => a.type)).not.toContain("image/webp");
  });
});

describe("R4: compression ladder", () => {
  test("a blob of exactly maxImageBytes is accepted on the first attempt", async () => {
    blobSize = () => maxImageBytes;

    const result = await cropImage(file(), big);

    expect(summary()).toEqual(ladder(4000, 3000, [0.92]));
    expect(result.type).toBe("image/jpeg");
  });

  test("one byte over tries quality 0.8 at full size", async () => {
    blobSize = (a) => (a.quality === 0.92 ? over : maxImageBytes);

    await cropImage(file(), big);

    expect(summary()).toEqual(ladder(4000, 3000, [0.92, 0.8]));
  });

  test("steps 0.92, 0.8, 0.7 at full size and returns the first that fits", async () => {
    blobSize = (a) =>
      a.quality !== undefined && a.quality <= 0.7 ? 4_000_000 : over;

    const result = await cropImage(file(), big);

    expect(summary()).toEqual(ladder(4000, 3000, [0.92, 0.8, 0.7]));
    expect(result.type).toBe("image/jpeg");
  });

  test("after 0.6 at full size, halves the long edge and restarts at 0.92", async () => {
    blobSize = (a) => (a.width <= 2000 ? 1000 : over);

    await cropImage(file(), big);

    expect(summary()).toEqual([
      ...ladder(4000, 3000, [0.92, 0.8, 0.7, 0.6]),
      ...ladder(2000, 1500, [0.92]),
    ]);
  });

  test("a shrunk step walks 0.92, 0.8, 0.7, 0.6 too", async () => {
    blobSize = (a) => (a.width === 2000 && a.quality === 0.6 ? 1000 : over);

    await cropImage(file(), big);

    expect(summary()).toEqual([
      ...ladder(4000, 3000, [0.92, 0.8, 0.7, 0.6]),
      ...ladder(2000, 1500, [0.92, 0.8, 0.7, 0.6]),
    ]);
  });

  test("halving stops at a long edge of 1600, which is tried last", async () => {
    blobSize = () => over;

    await expect(cropImage(file(), big)).rejects.toBeInstanceOf(
      ImageTooLargeError,
    );

    expect(summary()).toEqual([
      ...ladder(4000, 3000, [0.92, 0.8, 0.7, 0.6]),
      ...ladder(2000, 1500, [0.92, 0.8, 0.7, 0.6]),
      ...ladder(1600, 1200, [0.92, 0.8, 0.7, 0.6]),
    ]);
  });

  test("a portrait crop halves its height, the long edge", async () => {
    blobSize = () => over;

    await expect(
      cropImage(file(), { x: 0, y: 0, width: 3000, height: 4000 }),
    ).rejects.toBeInstanceOf(ImageTooLargeError);

    const sizes = [...new Set(attempts.map((a) => `${a.width}x${a.height}`))];
    expect(sizes).toEqual(["3000x4000", "1500x2000", "1200x1600"]);
  });

  test.each([
    ["3200 goes straight to 1600", 3200, [3200, 1600]],
    ["3201 goes straight to 1600", 3201, [3201, 1600]],
    ["3202 halves to 1601, then 1600", 3202, [3202, 1601, 1600]],
    ["8000 halves to 4000, 2000, 1600", 8000, [8000, 4000, 2000, 1600]],
  ])("long edge %s", async (_, width, edges) => {
    blobSize = () => over;

    await expect(
      cropImage(file(), { x: 0, y: 0, width, height: 1000 }),
    ).rejects.toBeInstanceOf(ImageTooLargeError);

    const widths = [...new Set(attempts.map((a) => a.width))];
    expect(widths).toEqual(edges);
    expect(attempts).toHaveLength(edges.length * 4);
  });

  test("shrinking keeps the aspect ratio", async () => {
    blobSize = () => over;

    await expect(
      cropImage(file(), { x: 0, y: 0, width: 4321, height: 1234 }),
    ).rejects.toBeInstanceOf(ImageTooLargeError);

    for (const { width, height } of attempts) {
      expect(Math.abs(height - (width * 1234) / 4321)).toBeLessThanOrEqual(1);
    }
    expect(attempts.at(-1)?.width).toBe(1600);
  });

  test("each shrunk step draws the full crop area into the smaller canvas", async () => {
    blobSize = (a) => (a.width === 2000 ? 1000 : over);

    await cropImage(file(), { x: 5, y: 7, width: 4000, height: 3000 });

    const lastDraw = ctx.drawImage.mock.calls.at(-1) as unknown[];
    expect(lastDraw.slice(1)).toEqual([5, 7, 4000, 3000, 0, 0, 2000, 1500]);
  });

  test("the 16,777,216 px cap still applies to the first attempt", async () => {
    await cropImage(file(), { x: 0, y: 0, width: 5712, height: 4284 });

    expect(summary()).toEqual(ladder(4729, 3547, [0.92]));
  });

  test("an area of exactly 16,777,216 px (4096×4096) is not scaled", async () => {
    await cropImage(file(), { x: 5, y: 7, width: 4096, height: 4096 });

    expect(summary()).toEqual(ladder(4096, 4096, [0.92]));
    expect(ctx.drawImage.mock.calls[0].slice(1)).toEqual([
      5, 7, 4096, 4096, 0, 0, 4096, 4096,
    ]);
  });

  test("one pixel over the cap is scaled", async () => {
    await cropImage(file(), { x: 0, y: 0, width: 4097, height: 4096 });

    const { width, height } = attempts[0];
    expect(width * height).toBeLessThanOrEqual(16_777_216);
  });

  test("a capped area over the limit still ends at a 1600 long edge", async () => {
    blobSize = () => over;

    await expect(
      cropImage(file(), { x: 0, y: 0, width: 5712, height: 4284 }),
    ).rejects.toBeInstanceOf(ImageTooLargeError);

    expect(attempts[0]).toMatchObject({ width: 4729, height: 3547 });
    expect(attempts.at(-1)).toMatchObject({ width: 1600, quality: 0.6 });
    for (const { width, height } of attempts) {
      expect(width * height).toBeLessThanOrEqual(16_777_216);
    }
  });

  test("draws the selected area of the loaded image at 1:1 when it fits", async () => {
    await cropImage(file(), area);

    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    const [image, ...rest] = ctx.drawImage.mock.calls[0] as unknown[];
    expect(image).toBeInstanceOf(HTMLImageElement);
    expect((image as HTMLImageElement).src).toBe("blob:source");
    expect(rest).toEqual([10, 20, 400, 300, 0, 0, 400, 300]);
  });

  test("1×1 area at the origin", async () => {
    await cropImage(file(), { x: 0, y: 0, width: 1, height: 1 });

    expect(summary()).toEqual(ladder(1, 1, [0.92]));
  });
});

describe("R4: PNG and WebP sources switch to JPEG on a white background", () => {
  test.each(["image/png", "image/webp"])(
    "%s over the limit retries as JPEG 0.8, 0.7, 0.6",
    async (type) => {
      blobSize = (a) =>
        a.type === "image/jpeg" && a.quality === 0.6 ? 1000 : over;

      const result = await cropImage(file("pic.png", type), big);

      expect(summary()).toEqual([
        [4000, 3000, type, 0.92],
        ...ladder(4000, 3000, [0.8, 0.7, 0.6]),
      ]);
      expect(result.type).toBe("image/jpeg");
    },
  );

  test("the JPEG retry paints white under the image", async () => {
    blobSize = (a) => (a.type === "image/png" ? over : 1000);

    await cropImage(file("pic.png", "image/png"), big);

    const whiteFills = ctx.fills.filter((fill) => isWhite(fill.style));
    expect(whiteFills.length).toBeGreaterThan(0);
    // The fill covers the whole canvas.
    expect(whiteFills.at(-1)?.args).toEqual([0, 0, 4000, 3000]);
    // Painted before the image is drawn for the JPEG attempt.
    const lastFill = ctx.fillRect.mock.invocationCallOrder.at(-1) ?? 0;
    const lastDraw = ctx.drawImage.mock.invocationCallOrder.at(-1) ?? 0;
    expect(lastFill).toBeLessThan(lastDraw);
  });

  test("a PNG over the limit after every step throws", async () => {
    blobSize = () => over;

    await expect(
      cropImage(file("pic.png", "image/png"), big),
    ).rejects.toBeInstanceOf(ImageTooLargeError);

    expect(attempts.filter((a) => a.type === "image/png")).toHaveLength(1);
    expect(attempts.at(-1)).toMatchObject({
      width: 1600,
      type: "image/jpeg",
      quality: 0.6,
    });
  });
});

describe("R5: no upscaling", () => {
  test.each([
    ["exactly 1600", 1600, 1200],
    ["under 1600", 1500, 1000],
    ["portrait at 1600", 900, 1600],
    ["tiny", 10, 10],
  ])(
    "a crop with a long edge %s skips the shrink steps",
    async (_, width, height) => {
      blobSize = () => over;

      await expect(
        cropImage(file(), { x: 0, y: 0, width, height }),
      ).rejects.toBeInstanceOf(ImageTooLargeError);

      expect(summary()).toEqual(ladder(width, height, [0.92, 0.8, 0.7, 0.6]));
    },
  );

  test("a long edge of 1601 gets one shrink step, at 1600", async () => {
    blobSize = () => over;

    await expect(
      cropImage(file(), { x: 0, y: 0, width: 1601, height: 1000 }),
    ).rejects.toBeInstanceOf(ImageTooLargeError);

    expect([...new Set(attempts.map((a) => a.width))]).toEqual([1601, 1600]);
    expect(attempts).toHaveLength(8);
  });
});

describe("R6: ImageTooLargeError", () => {
  test("is an Error with the file name in its message", async () => {
    blobSize = () => over;

    const error = await cropImage(file("big.jpg"), big).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ImageTooLargeError);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Couldn't shrink big.jpg under 5 MB");
  });

  test.each(["IMG_0001.HEIC", "相片 🐶.jpg", "with spaces (1).jpeg"])(
    "names %j as picked",
    async (name) => {
      blobSize = () => over;

      await expect(cropImage(file(name), big)).rejects.toThrow(
        `Couldn't shrink ${name} under 5 MB`,
      );
    },
  );

  test("still revokes the object URL", async () => {
    blobSize = () => over;

    await expect(cropImage(file(), big)).rejects.toBeInstanceOf(
      ImageTooLargeError,
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:source");
  });
});

describe("R7: output file name", () => {
  test.each([
    ["IMG_0001.HEIC", "image/heic", "IMG_0001.jpg"],
    ["IMG_0001.heif", "image/heif", "IMG_0001.jpg"],
    ["IMG_0001.HEIC", "", "IMG_0001.jpg"],
    ["scan.bmp", "image/bmp", "scan.jpg"],
    ["photo.jpg", "image/jpeg", "photo.jpg"],
    ["pic.png", "image/png", "pic.png"],
    ["pic.webp", "image/webp", "pic.webp"],
    ["a.b.c.heic", "image/heic", "a.b.c.jpg"],
    ["noext", "image/heic", "noext.jpg"],
    ["相片 2026.HEIC", "image/heic", "相片 2026.jpg"],
    ["🐶 dory.heic", "image/heic", "🐶 dory.jpg"],
  ])("%s (%j) becomes %s", async (name, type, expected) => {
    const result = await cropImage(file(name, type), area);

    expect(result.name).toBe(expected);
  });

  test("a very long name keeps its base", async () => {
    const base = "a".repeat(240);

    const result = await cropImage(file(`${base}.heic`, "image/heic"), area);

    expect(result.name).toBe(`${base}.jpg`);
  });

  test.each(["image/png", "image/webp"])(
    "a %s compressed to JPEG gets .jpg",
    async (type) => {
      blobSize = (a) => (a.type === type ? over : 1000);

      const result = await cropImage(file("pic.png", type), big);

      expect(result.name).toBe("pic.jpg");
      expect(result.type).toBe("image/jpeg");
    },
  );

  test("the name and type agree for every output", async () => {
    const result = await cropImage(file("IMG_9.HEIC", "image/heic"), area);

    expect(result.name.endsWith(".jpg")).toBe(true);
    expect(result.type).toBe("image/jpeg");
  });
});

describe("cropImage failures (today's behaviour)", () => {
  test("loads the source through an object URL and revokes it", async () => {
    const source = file();
    await cropImage(source, area);

    expect(URL.createObjectURL).toHaveBeenCalledWith(source);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:source");
  });

  test("rejects when the image fails to load, and still revokes the URL", async () => {
    loadOutcome = "error";

    const error = await cropImage(file(), area).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeDefined();
    expect(error).not.toBeInstanceOf(ImageTooLargeError);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:source");
  });

  test("rejects when the 2D context is unavailable, and still revokes the URL", async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);

    const error = await cropImage(file(), area).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeDefined();
    expect(error).not.toBeInstanceOf(ImageTooLargeError);
    expect(HTMLCanvasElement.prototype.toBlob).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:source");
  });

  test("rejects when toBlob yields null, and still revokes the URL", async () => {
    blobOutcome = "null";

    const error = await cropImage(file(), area).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeDefined();
    expect(error).not.toBeInstanceOf(ImageTooLargeError);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:source");
  });
});

describe("cropImage (white-box)", () => {
  test("a very thin crop never shrinks a side below 1 px", async () => {
    blobSize = () => over;

    await expect(
      cropImage(file(), { x: 0, y: 0, width: 8000, height: 1 }),
    ).rejects.toBeInstanceOf(ImageTooLargeError);

    expect(attempts.every((a) => a.width >= 1 && a.height >= 1)).toBe(true);
    expect(attempts.at(-1)).toMatchObject({ width: 1600, height: 1 });
  });

  test("a JPEG source draws once for 0.92 and once for its 0.8–0.6 retries", async () => {
    blobSize = (a) => (a.quality === 0.6 ? 1000 : over);

    await cropImage(file(), big);

    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
  });

  test("ImageTooLargeError is named for logs", () => {
    expect(new ImageTooLargeError("x").name).toBe("ImageTooLargeError");
  });

  test("one canvas per size step, reused across its qualities", async () => {
    blobSize = () => over;

    await expect(cropImage(file(), big)).rejects.toBeInstanceOf(
      ImageTooLargeError,
    );

    // full size: first attempt + JPEG retry; then 2000 and 1600
    expect(ctx.drawImage).toHaveBeenCalledTimes(4);
  });
});
