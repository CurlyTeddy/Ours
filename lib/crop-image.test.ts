import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Area } from "react-easy-crop";
import { cropImage } from "@/lib/crop-image";

// jsdom never decodes images and has no canvas, so both are stubbed here.
let loadOutcome: "load" | "error" = "load";
let blobOutcome: "blob" | "null" = "blob";
const supportedTypes = ["image/jpeg", "image/png", "image/webp"];
const ctx = { drawImage: vi.fn() };
const canvasSizes: [number, number][] = [];
const srcDescriptor = Object.getOwnPropertyDescriptor(
  HTMLImageElement.prototype,
  "src",
);

beforeEach(() => {
  loadOutcome = "load";
  blobOutcome = "blob";
  canvasSizes.length = 0;
  ctx.drawImage.mockClear();
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
  ) {
    canvasSizes.push([this.width, this.height]);
    // Like a browser: unsupported types fall back to PNG.
    const outType = type && supportedTypes.includes(type) ? type : "image/png";
    setTimeout(() => {
      callback(
        blobOutcome === "blob" ? new Blob(["pixels"], { type: outType }) : null,
      );
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
const file = (name = "photo.jpg", type = "image/jpeg") =>
  new File(["source"], name, { type });

describe("R7: cropImage output file", () => {
  test("resolves a File with the source name and the blob's type", async () => {
    const result = await cropImage(file(), area);

    expect(result).toBeInstanceOf(File);
    expect(result.name).toBe("photo.jpg");
    expect(result.type).toBe("image/jpeg");
  });

  test("encodes with the source type at quality 0.92", async () => {
    await cropImage(file(), area);

    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      "image/jpeg",
      0.92,
    );
  });

  test.each(["image/png", "image/webp"])("keeps %s", async (type) => {
    const result = await cropImage(file("pic", type), area);

    expect(result.type).toBe(type);
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      type,
      0.92,
    );
  });

  test.each(["image/bmp", "image/heic", ""])(
    "unsupported type %j falls back to what toBlob gives",
    async (type) => {
      const result = await cropImage(file("scan.bmp", type), area);

      expect(result.type).toBe("image/png");
      expect(result.name).toBe("scan.bmp");
    },
  );

  test("sizes the canvas to the crop area", async () => {
    await cropImage(file(), area);

    expect(canvasSizes).toEqual([[400, 300]]);
  });

  test("draws the selected area of the loaded image at 1:1", async () => {
    await cropImage(file(), area);

    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    const [image, ...rest] = ctx.drawImage.mock.calls[0] as unknown[];
    expect(image).toBeInstanceOf(HTMLImageElement);
    expect((image as HTMLImageElement).src).toBe("blob:source");
    expect(rest).toEqual([10, 20, 400, 300, 0, 0, 400, 300]);
  });

  test("loads the source through an object URL and revokes it", async () => {
    const source = file();
    await cropImage(source, area);

    expect(URL.createObjectURL).toHaveBeenCalledWith(source);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:source");
  });

  test("1×1 area at the origin", async () => {
    await cropImage(file(), { x: 0, y: 0, width: 1, height: 1 });

    expect(canvasSizes).toEqual([[1, 1]]);
    expect(ctx.drawImage.mock.calls[0].slice(1)).toEqual([
      0, 0, 1, 1, 0, 0, 1, 1,
    ]);
  });

  test("an area of exactly 16,777,216 pixels (4096×4096) is not scaled", async () => {
    await cropImage(file(), { x: 5, y: 7, width: 4096, height: 4096 });

    expect(canvasSizes).toEqual([[4096, 4096]]);
    expect(ctx.drawImage.mock.calls[0].slice(1)).toEqual([
      5, 7, 4096, 4096, 0, 0, 4096, 4096,
    ]);
  });

  test("an area over the cap (5712×4284) is scaled down to fit", async () => {
    await cropImage(file(), { x: 0, y: 0, width: 5712, height: 4284 });

    expect(canvasSizes).toEqual([[4729, 3547]]);
    const [width, height] = canvasSizes[0];
    expect(width * height).toBeLessThanOrEqual(16_777_216);
    expect(width / height).toBeCloseTo(5712 / 4284, 2);
    // Source rect stays the full area; the destination matches the canvas.
    expect(ctx.drawImage.mock.calls[0].slice(1)).toEqual([
      0, 0, 5712, 4284, 0, 0, 4729, 3547,
    ]);
  });

  test("one pixel over the cap is scaled", async () => {
    await cropImage(file(), { x: 0, y: 0, width: 4097, height: 4096 });

    const [width, height] = canvasSizes[0];
    expect(width * height).toBeLessThanOrEqual(16_777_216);
    expect(width).toBeLessThanOrEqual(4097);
    expect(height).toBeLessThan(4096);
  });

  test.each([
    "相片 2026.jpg",
    "🐶 dory.jpg",
    "with spaces (1).jpeg",
    `${"a".repeat(240)}.jpg`,
  ])("keeps filename %j unchanged", async (name) => {
    const result = await cropImage(file(name), area);

    expect(result.name).toBe(name);
  });
});

describe("R9: cropImage failures", () => {
  test("rejects when the image fails to load, and still revokes the URL", async () => {
    loadOutcome = "error";

    await expect(cropImage(file(), area)).rejects.toBeDefined();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:source");
  });

  test("rejects when the 2D context is unavailable, and still revokes the URL", async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);

    await expect(cropImage(file(), area)).rejects.toBeDefined();
    expect(HTMLCanvasElement.prototype.toBlob).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:source");
  });

  test("rejects when toBlob yields null, and still revokes the URL", async () => {
    blobOutcome = "null";

    await expect(cropImage(file(), area)).rejects.toBeDefined();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:source");
  });
});
