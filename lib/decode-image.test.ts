import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { isHeic, toDecodable } from "@/lib/decode-image";

// A fake libheif: one decoded image of the given size, filled by display().
const heif = vi.hoisted(() => ({
  loaded: 0,
  width: 400,
  height: 300,
  images: 1,
  decodeThrows: false,
  displayFails: false,
  decodedBytes: [] as number[],
  // Overrides width/height/images: one entry per image in the file
  list: null as { width: number; height: number; primary: boolean }[] | null,
  freed: 0,
}));
// The browser WASM bundle (ESM); its default export builds the library.
vi.mock("libheif-js/libheif-wasm/libheif-bundle.mjs", () => {
  heif.loaded += 1;
  class HeifDecoder {
    decode(data: ArrayBufferLike | Uint8Array) {
      heif.decodedBytes.push(data.byteLength);
      if (heif.decodeThrows) throw new Error("bad heic");
      const list =
        heif.list ??
        Array.from({ length: heif.images }, () => ({
          width: heif.width,
          height: heif.height,
          primary: true,
        }));
      return list.map(({ width, height, primary }) => ({
        is_primary: () => primary,
        get_width: () => width,
        get_height: () => height,
        display: (
          target: { data: Uint8ClampedArray; width: number; height: number },
          callback: (result: unknown) => void,
        ) => {
          callback(heif.displayFails ? null : target);
        },
        free: () => {
          heif.freed += 1;
        },
      }));
    }
  }
  const lib = { HeifDecoder };
  return { default: () => lib };
});

const supportedTypes = ["image/jpeg", "image/png", "image/webp"];
const toBlobCalls: {
  width: number;
  height: number;
  type?: string;
  quality?: number;
}[] = [];
let blobOutcome: "blob" | "null" = "blob";
const ctx = {
  drawImage: vi.fn(),
  putImageData: vi.fn(),
  createImageData: vi.fn((width: number, height: number) => ({
    data: new Uint8ClampedArray(width * height * 4),
    width,
    height,
  })),
};

beforeEach(() => {
  heif.width = 400;
  heif.height = 300;
  heif.images = 1;
  heif.decodeThrows = false;
  heif.displayFails = false;
  heif.decodedBytes = [];
  heif.list = null;
  heif.freed = 0;
  blobOutcome = "blob";
  toBlobCalls.length = 0;
  ctx.drawImage.mockClear();
  ctx.putImageData.mockClear();
  ctx.createImageData.mockClear();
  // jsdom has no ImageData; a plain stand-in is enough for putImageData.
  vi.stubGlobal(
    "ImageData",
    globalThis.ImageData ??
      function ImageData(
        this: { data: Uint8ClampedArray; width: number; height: number },
        dataOrWidth: Uint8ClampedArray | number,
        widthOrHeight: number,
        height?: number,
      ) {
        if (typeof dataOrWidth === "number") {
          this.width = dataOrWidth;
          this.height = widthOrHeight;
          this.data = new Uint8ClampedArray(dataOrWidth * widthOrHeight * 4);
        } else {
          this.data = dataOrWidth;
          this.width = widthOrHeight;
          this.height = height ?? dataOrWidth.length / 4 / widthOrHeight;
        }
      },
  );
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:source");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
    type?: string,
    quality?: number,
  ) {
    toBlobCalls.push({ width: this.width, height: this.height, type, quality });
    const outType = type && supportedTypes.includes(type) ? type : "image/png";
    setTimeout(() => {
      callback(
        blobOutcome === "blob" ? new Blob(["jpeg"], { type: outType }) : null,
      );
    }, 0);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const nativeDecode = (ok: boolean) => {
  // Only the picked file fails; decoded pixels (ImageData) always turn into a bitmap.
  const createImageBitmap = vi.fn(async (source: unknown) => {
    if (!ok && source instanceof Blob)
      throw new DOMException("The source image could not be decoded.");
    return { width: 10, height: 10, close: vi.fn() };
  });
  vi.stubGlobal("createImageBitmap", createImageBitmap);
  return createImageBitmap;
};
const file = (name: string, type: string, body = "bytes") =>
  new File([body], name, { type });

describe("R9: isHeic", () => {
  test.each([
    ["type image/heic", "photo", "image/heic"],
    ["type image/heif", "photo", "image/heif"],
    [
      "a .heic name with an empty type (Chrome on Windows)",
      "IMG_0001.heic",
      "",
    ],
    ["a .HEIC name", "IMG_0001.HEIC", ""],
    ["a .heif name", "IMG_0001.heif", ""],
    ["a .HeIf name", "IMG_0001.HeIf", ""],
    [
      "a .heic name with an octet-stream type",
      "a.heic",
      "application/octet-stream",
    ],
    ["a .heic name with a jpeg type", "a.heic", "image/jpeg"],
    ["a CJK .heic name", "相片 🐶.HEIC", ""],
  ])("true for %s", (_, name, type) => {
    expect(isHeic(file(name, type))).toBe(true);
  });

  test.each([
    ["a JPEG", "a.jpg", "image/jpeg"],
    ["a PNG", "a.png", "image/png"],
    ["a GIF", "a.gif", "image/gif"],
    ["an empty type and name", "", ""],
    ["heic only inside the name", "heic-photo.jpg", "image/jpeg"],
    ["a .heic. name", "a.heic.jpg", "image/jpeg"],
    ["a name of just heic without a dot", "heic", ""],
    ["an AVIF", "a.avif", "image/avif"],
  ])("false for %s", (_, name, type) => {
    expect(isHeic(file(name, type))).toBe(false);
  });
});

describe("R10: toDecodable, native path", () => {
  test("a non-HEIC file is returned as-is without a decode probe or libheif", async () => {
    const createImageBitmap = nativeDecode(true);
    const jpeg = file("a.jpg", "image/jpeg");

    expect(await toDecodable(jpeg)).toBe(jpeg);
    expect(createImageBitmap).not.toHaveBeenCalled();
    expect(heif.loaded).toBe(0);
  });

  test("a HEIC the browser decodes natively (Safari) is used as-is", async () => {
    const createImageBitmap = nativeDecode(true);
    const heic = file("IMG_0001.HEIC", "image/heic");

    expect(await toDecodable(heic)).toBe(heic);
    expect(createImageBitmap).toHaveBeenCalledWith(heic);
    expect(heif.loaded).toBe(0);
    expect(heif.decodedBytes).toEqual([]);
  });

  test.each([
    ["a JPEG", "a.jpg", "image/jpeg"],
    ["a PNG", "a.png", "image/png"],
    ["an unnamed file with no type", "blob", ""],
  ])(
    "%s the browser can't decode is passed on unchanged (the cropper drops it later)",
    async (_, name, type) => {
      const createImageBitmap = nativeDecode(false);
      const broken = file(name, type);

      expect(await toDecodable(broken)).toBe(broken);
      expect(createImageBitmap).not.toHaveBeenCalled();
      expect(heif.decodedBytes).toEqual([]);
    },
  );
});

describe("R10: toDecodable, libheif fallback", () => {
  test.each([
    ["type image/heic", "IMG_0001.HEIC", "image/heic"],
    ["type image/heif", "IMG_0001.heif", "image/heif"],
    ["an empty type and .heic name", "IMG_0001.heic", ""],
  ])("%s decodes into a JPEG File at 0.92", async (_, name, type) => {
    nativeDecode(false);

    const result = await toDecodable(file(name, type, "heic-bytes"));

    expect(result).toBeInstanceOf(File);
    expect(result.type).toBe("image/jpeg");
    expect(result.name).toBe("IMG_0001.jpg");
    expect(heif.decodedBytes).toEqual([10]);
    expect(toBlobCalls.at(-1)).toMatchObject({
      type: "image/jpeg",
      quality: 0.92,
    });
    expect(toBlobCalls.at(-1)).toMatchObject({ width: 400, height: 300 });
  });

  test("a CJK and emoji name keeps its base", async () => {
    nativeDecode(false);

    const result = await toDecodable(file("相片 🐶.HEIC", ""));

    expect(result.name).toBe("相片 🐶.jpg");
  });

  test("a photo over 16,777,216 px is scaled down to fit, keeping its aspect", async () => {
    nativeDecode(false);
    heif.width = 5712;
    heif.height = 4284;

    await toDecodable(file("IMG_0002.heic", "image/heic"));

    const { width, height } = toBlobCalls.at(-1) ?? { width: 0, height: 0 };
    expect(width * height).toBeLessThanOrEqual(16_777_216);
    expect(width).toBeGreaterThan(4500);
    expect(width / height).toBeCloseTo(5712 / 4284, 2);
  });

  test("exactly 16,777,216 px (4096×4096) is not scaled", async () => {
    nativeDecode(false);
    heif.width = 4096;
    heif.height = 4096;

    await toDecodable(file("IMG_0003.heic", "image/heic"));

    expect(toBlobCalls.at(-1)).toMatchObject({ width: 4096, height: 4096 });
  });

  test("libheif is loaded once the fallback is needed", async () => {
    nativeDecode(false);

    await toDecodable(file("IMG_0004.heic", "image/heic"));

    expect(heif.loaded).toBe(1);
  });
});

describe("R10/R11: toDecodable failures throw", () => {
  test("libheif can't parse the file", async () => {
    nativeDecode(false);
    heif.decodeThrows = true;

    await expect(
      toDecodable(file("broken.heic", "image/heic")),
    ).rejects.toBeDefined();
  });

  test("the file holds no image", async () => {
    nativeDecode(false);
    heif.images = 0;

    await expect(
      toDecodable(file("empty.heic", "image/heic")),
    ).rejects.toBeDefined();
  });

  test("display() yields nothing", async () => {
    nativeDecode(false);
    heif.displayFails = true;

    await expect(
      toDecodable(file("broken.heic", "image/heic")),
    ).rejects.toBeDefined();
  });

  test("the JPEG encode yields null", async () => {
    nativeDecode(false);
    blobOutcome = "null";

    await expect(
      toDecodable(file("IMG_0005.heic", "image/heic")),
    ).rejects.toBeDefined();
  });

  test("no 2D context", async () => {
    nativeDecode(false);
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);

    await expect(
      toDecodable(file("IMG_0006.heic", "image/heic")),
    ).rejects.toBeDefined();
  });
});

describe("toDecodable (white-box)", () => {
  test("the native probe's bitmap is closed", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ close })),
    );

    await toDecodable(file("IMG_1.HEIC", "image/heic"));

    expect(close).toHaveBeenCalledTimes(1);
  });

  test("the resized bitmap is closed after drawing", async () => {
    const closes: unknown[] = [];
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async (source: unknown) => {
        if (source instanceof Blob) throw new DOMException("no heic");
        return { close: () => closes.push(source) };
      }),
    );

    await toDecodable(file("IMG_1.heic", "image/heic"));

    expect(closes).toHaveLength(1);
    expect(closes[0]).not.toBeInstanceOf(Blob);
  });

  test("a non-HEIC never hits createImageBitmap, even when it would throw", async () => {
    const createImageBitmap = vi.fn(async () => {
      throw new DOMException("nope");
    });
    vi.stubGlobal("createImageBitmap", createImageBitmap);
    const png = file("a.png", "image/png");

    expect(await toDecodable(png)).toBe(png);
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  test("no createImageBitmap at all: a HEIC is rejected, a JPEG passes", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    const jpeg = file("a.jpg", "image/jpeg");

    await expect(
      toDecodable(file("IMG_1.heic", "image/heic")),
    ).rejects.toBeDefined();
    expect(await toDecodable(jpeg)).toBe(jpeg);
  });

  test("the primary image wins over the first one", async () => {
    nativeDecode(false);
    heif.list = [
      { width: 160, height: 120, primary: false },
      { width: 800, height: 600, primary: true },
    ];

    await toDecodable(file("IMG_2.heic", "image/heic"));

    expect(toBlobCalls.at(-1)).toMatchObject({ width: 800, height: 600 });
  });

  test("without a primary image, the first one is used", async () => {
    nativeDecode(false);
    heif.list = [
      { width: 640, height: 480, primary: false },
      { width: 800, height: 600, primary: false },
    ];

    await toDecodable(file("IMG_3.heic", "image/heic"));

    expect(toBlobCalls.at(-1)).toMatchObject({ width: 640, height: 480 });
  });

  test("every decoded image is freed on success", async () => {
    nativeDecode(false);
    heif.images = 3;

    await toDecodable(file("IMG_4.heic", "image/heic"));

    expect(heif.freed).toBe(3);
  });

  test("every decoded image is freed when display fails", async () => {
    nativeDecode(false);
    heif.images = 2;
    heif.displayFails = true;

    await expect(toDecodable(file("IMG_5.heic", "image/heic"))).rejects.toThrow(
      "Failed to decode IMG_5.heic",
    );
    expect(heif.freed).toBe(2);
  });

  test("an empty file reports the picked name", async () => {
    nativeDecode(false);
    heif.images = 0;

    await expect(toDecodable(file("empty.heic", "image/heic"))).rejects.toThrow(
      "Failed to decode empty.heic",
    );
  });

  test("display() fills a full-size ImageData, resized as a bitmap onto one capped canvas", async () => {
    const createImageBitmap = nativeDecode(false);
    const canvases: [number, number][] = [];
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockImplementation(
      function (this: HTMLCanvasElement) {
        canvases.push([this.width, this.height]);
        return ctx as unknown as CanvasRenderingContext2D;
      },
    );
    heif.width = 5712;
    heif.height = 4284;

    await toDecodable(file("IMG_6.heic", "image/heic"));

    const [pixels, options] = createImageBitmap.mock.calls.at(
      -1,
    ) as unknown as [{ width: number; height: number }, ImageBitmapOptions];
    expect(pixels).toMatchObject({ width: 5712, height: 4284 });
    expect(options).toEqual({
      resizeWidth: 4729,
      resizeHeight: 3547,
      resizeQuality: "high",
    });
    expect(canvases).toEqual([[4729, 3547]]);
    expect(ctx.putImageData).not.toHaveBeenCalled();
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(ctx.drawImage.mock.calls[0].slice(1)).toEqual([0, 0]);
  });

  test("a photo under the cap is resized to its own size", async () => {
    const createImageBitmap = nativeDecode(false);

    await toDecodable(file("IMG_7.heic", "image/heic"));

    expect((createImageBitmap.mock.calls.at(-1) as unknown[])[1]).toEqual({
      resizeWidth: 400,
      resizeHeight: 300,
      resizeQuality: "high",
    });
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
  });

  test("the resize step failing rejects", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new DOMException("no");
      }),
    );

    await expect(
      toDecodable(file("IMG_8.heic", "image/heic")),
    ).rejects.toBeDefined();
    expect(heif.freed).toBe(1);
  });
});
