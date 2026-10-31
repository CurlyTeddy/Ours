import { beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { Area } from "react-easy-crop";
import { cropper } from "@/__mocks__/react-easy-crop";
import { toast } from "sonner";
import { cropImage, ImageTooLargeError } from "@/lib/crop-image";
import { toDecodable } from "@/lib/decode-image";
import { maxImageBytes } from "@/lib/image-upload";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";

vi.mock("react-easy-crop");
// These tests report crop areas by hand to control when Apply enables.
cropper.autoReport = false;
vi.mock("@/lib/crop-image", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/crop-image")>()),
  cropImage: vi.fn(),
}));
vi.mock("@/lib/decode-image", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/decode-image")>()),
  toDecodable: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

const AREA: Area = { x: 12, y: 34, width: 400, height: 300 };
// Preview URLs already applied or cancelled; a stale cropper must not be reported.
const done = new Set<string>();
const mounted = () =>
  waitFor(() => {
    expect(cropper.props?.image).toBeDefined();
    expect(done.has(cropper.props.image as string)).toBe(false);
  });
const report = async (area: Area = AREA) => {
  await mounted();
  act(() => {
    cropper.props.onCropComplete?.(
      { x: 0, y: 0, width: 100, height: 100 },
      area,
    );
  });
};
const markDone = () => done.add(cropper.props.image as string);

const jpg = (name: string) => new File([name], name, { type: "image/jpeg" });
const gif = (name: string, size?: number) => {
  const file = new File([name], name, { type: "image/gif" });
  if (size !== undefined) Object.defineProperty(file, "size", { value: size });
  return file;
};
const heic = (name: string) => new File([name], name, { type: "" });
const cropped = new Map<File, File>();
const decoded = new Map<File, File>();

beforeEach(() => {
  vi.clearAllMocks();
  cropped.clear();
  decoded.clear();
  done.clear();
  cropper.props = undefined as unknown as typeof cropper.props;
  let n = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation(
    () => `blob:${(n++).toString()}`,
  );
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.mocked(toDecodable).mockImplementation(async (file) => file);
  vi.mocked(cropImage).mockImplementation(async (file) => {
    const out = new File(["cropped"], file.name, { type: file.type });
    cropped.set(file, out);
    return out;
  });
});

// Behaves like a call site: clears its files after onComplete.
function Harness(props: {
  files: File[];
  aspect?: number;
  cropShape?: "rect" | "round";
  onComplete: (files: File[]) => void;
}) {
  const [files, setFiles] = useState(props.files);
  return (
    <ImageCropDialog
      files={files}
      aspect={props.aspect ?? 4 / 3}
      cropShape={props.cropShape}
      onComplete={(result) => {
        props.onComplete(result);
        setFiles([]);
      }}
    />
  );
}

function setup(
  files: File[],
  extra: Partial<Parameters<typeof Harness>[0]> = {},
) {
  const onComplete = vi.fn();
  const user = userEvent.setup();
  render(<Harness files={files} onComplete={onComplete} {...extra} />);
  return { onComplete, user };
}

const apply = async (user: ReturnType<typeof userEvent.setup>) => {
  await report();
  markDone();
  await user.click(screen.getByRole("button", { name: "Apply" }));
};
const cancel = async (user: ReturnType<typeof userEvent.setup>) => {
  await mounted();
  markDone();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
};
const tooLarge = (name: string) => {
  const Ctor = ImageTooLargeError as unknown as new (arg: string) => Error;
  // The message is what the dialog shows, whatever the constructor takes.
  return Object.assign(new Ctor(name), {
    message: `Couldn't shrink ${name} under 5 MB`,
  });
};

describe("R1: dialog opens on selection", () => {
  test("no files: no dialog and no completion", () => {
    const { onComplete } = setup([]);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
  });

  test("one JPEG opens the Crop image dialog and holds the file", async () => {
    const { onComplete } = setup([jpg("a.jpg")]);

    expect(
      await screen.findByRole("dialog", { name: "Crop image" }),
    ).toBeDefined();
    expect(onComplete).not.toHaveBeenCalled();
  });

  test("nothing completes until every picked image is handled", async () => {
    const { onComplete, user } = setup([jpg("a.jpg"), jpg("b.jpg")]);

    await apply(user);
    expect(onComplete).not.toHaveBeenCalled();
    await cancel(user);
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });

  test("dialog closes after the queue completes", async () => {
    const { user } = setup([jpg("a.jpg")]);

    await apply(user);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("R2: two buttons only", () => {
  test("only Apply, Cancel and the close (X) button", async () => {
    setup([jpg("a.jpg")]);
    const dialog = await screen.findByRole("dialog");

    const names = within(dialog)
      .getAllByRole("button")
      .map((b) => b.textContent?.trim())
      .sort();
    expect(names).toEqual(["Apply", "Cancel", "Close"]);
  });

  test("Escape cancels the current image", async () => {
    const { onComplete, user } = setup([jpg("a.jpg")]);

    await mounted();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith([]));
    expect(cropImage).not.toHaveBeenCalled();
  });

  test("the close (X) button cancels the current image", async () => {
    const { onComplete, user } = setup([jpg("a.jpg")]);

    await mounted();
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith([]));
  });

  test("clicking the overlay cancels the current image", async () => {
    const { onComplete, user } = setup([jpg("a.jpg")]);

    await mounted();
    const overlay = document.querySelector('[data-slot="dialog-overlay"]');
    expect(overlay).not.toBeNull();
    await user.click(overlay as Element);
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith([]));
  });

  test("Escape with several images drops only the current one", async () => {
    const { onComplete, user } = setup([jpg("a.jpg"), jpg("b.jpg")]);

    await mounted();
    markDone();
    await user.keyboard("{Escape}");
    expect(await screen.findByText("Image 2 of 2")).toBeDefined();
    expect(onComplete).not.toHaveBeenCalled();
    await apply(user);
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete.mock.calls[0][0]).toHaveLength(1);
    expect(onComplete.mock.calls[0][0][0].name).toBe("b.jpg");
  });
});

describe("R3: one image at a time", () => {
  test("description counts through the queue", async () => {
    const { user } = setup([jpg("a.jpg"), jpg("b.jpg"), jpg("c.jpg")]);

    expect(
      await screen.findByRole("dialog", { description: "Image 1 of 3" }),
    ).toBeDefined();
    await apply(user);
    expect(await screen.findByText("Image 2 of 3")).toBeDefined();
    await cancel(user);
    expect(await screen.findByText("Image 3 of 3")).toBeDefined();
  });

  test("a single image has no counter", async () => {
    setup([jpg("a.jpg")]);

    await mounted();
    expect(screen.queryByText(/Image \d+ of \d+/)).toBeNull();
  });

  test("images are shown in picked order", async () => {
    const a = jpg("a.jpg");
    const b = jpg("b.jpg");
    const c = jpg("c.jpg");
    const { user } = setup([a, b, c]);

    await apply(user);
    await screen.findByText("Image 2 of 3");
    await apply(user);
    await screen.findByText("Image 3 of 3");
    await apply(user);

    await waitFor(() => expect(cropImage).toHaveBeenCalledTimes(3));
    expect(vi.mocked(cropImage).mock.calls.map(([f]) => f)).toEqual([a, b, c]);
  });

  test.each(["Apply", "Cancel"])(
    "pan and zoom reset after %s",
    async (action) => {
      const { user } = setup([jpg("a.jpg"), jpg("b.jpg")]);

      await mounted();
      act(() => {
        cropper.props.onCropChange({ x: 30, y: -20 });
        cropper.props.onZoomChange?.(2.5);
      });
      expect(cropper.props.zoom).toBe(2.5);
      expect(cropper.props.crop).toEqual({ x: 30, y: -20 });

      if (action === "Apply") await apply(user);
      else await cancel(user);
      await screen.findByText("Image 2 of 2");
      await mounted();

      expect(cropper.props.zoom).toBe(1);
      expect(cropper.props.crop).toEqual({ x: 0, y: 0 });
    },
  );
});

describe("R4: cancel drops one image", () => {
  test("apply, cancel, apply returns the two applied files in order", async () => {
    const a = jpg("a.jpg");
    const b = jpg("b.jpg");
    const c = jpg("c.jpg");
    const { onComplete, user } = setup([a, b, c]);

    await apply(user);
    await screen.findByText("Image 2 of 3");
    await cancel(user);
    await screen.findByText("Image 3 of 3");
    await apply(user);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete).toHaveBeenCalledWith([cropped.get(a), cropped.get(c)]);
  });

  test("every image cancelled completes once with an empty array", async () => {
    const { onComplete, user } = setup([jpg("a.jpg"), jpg("b.jpg")]);

    await cancel(user);
    await screen.findByText("Image 2 of 2");
    await cancel(user);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete).toHaveBeenCalledWith([]);
    expect(cropImage).not.toHaveBeenCalled();
  });

  test("a new files array starts a new queue", async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();
    const file = jpg("a.jpg");
    const { rerender } = render(
      <ImageCropDialog files={[file]} aspect={1} onComplete={onComplete} />,
    );

    await cancel(user);
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    rerender(<ImageCropDialog files={[]} aspect={1} onComplete={onComplete} />);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    rerender(
      <ImageCropDialog files={[file]} aspect={1} onComplete={onComplete} />,
    );
    expect(
      await screen.findByRole("dialog", { name: "Crop image" }),
    ).toBeDefined();
    await apply(user);
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(2));
    expect(onComplete).toHaveBeenLastCalledWith([cropped.get(file)]);
  });
});

describe("R5: aspect ratio and shape", () => {
  test("4:3 with a rectangular frame", async () => {
    setup([jpg("a.jpg")], { aspect: 4 / 3, cropShape: "rect" });

    await mounted();
    expect(cropper.props.aspect).toBe(4 / 3);
    expect(cropper.props.cropShape ?? "rect").toBe("rect");
  });

  test("1:1 with a round frame", async () => {
    setup([jpg("a.jpg")], { aspect: 1, cropShape: "round" });

    await mounted();
    expect(cropper.props.aspect).toBe(1);
    expect(cropper.props.cropShape).toBe("round");
  });
});

describe("R6: controls", () => {
  test("zoom starts at 1 and ranges from 1 to 3, with no slider", async () => {
    setup([jpg("a.jpg")]);

    await mounted();
    expect(cropper.props.zoom).toBe(1);
    expect(cropper.props.minZoom).toBe(1);
    expect(cropper.props.maxZoom).toBe(3);
    expect(screen.queryByRole("slider")).toBeNull();
  });

  test("pinch or wheel zoom and drag update the cropper", async () => {
    setup([jpg("a.jpg")]);

    await mounted();
    act(() => cropper.props.onZoomChange?.(2));
    expect(cropper.props.zoom).toBe(2);
    act(() => cropper.props.onCropChange({ x: -15, y: 8 }));
    expect(cropper.props.crop).toEqual({ x: -15, y: 8 });
  });
});

describe("R7: apply produces the cropped file", () => {
  test("crops the current file with the latest reported pixel area", async () => {
    const a = jpg("a.jpg");
    const { onComplete, user } = setup([a]);
    const latest = { x: 1, y: 2, width: 3, height: 4 };

    await report();
    await report(latest);
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(cropImage).toHaveBeenCalledWith(a, latest);
    expect(onComplete).toHaveBeenCalledWith([cropped.get(a)]);
  });
});

describe("R8: GIFs skip the dialog", () => {
  test("a lone GIF never opens the dialog and passes through unchanged", async () => {
    const g = gif("party.gif");
    const { onComplete } = setup([g]);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete.mock.calls[0][0][0]).toBe(g);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(cropImage).not.toHaveBeenCalled();
    expect(toDecodable).not.toHaveBeenCalled();
  });

  test("a GIF keeps its place between cropped images", async () => {
    const a = jpg("a.jpg");
    const g = gif("b.gif");
    const c = new File(["c"], "c.png", { type: "image/png" });
    const { onComplete, user } = setup([a, g, c]);

    await apply(user);
    await waitFor(() => expect(cropImage).toHaveBeenCalledTimes(1));
    await apply(user);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete).toHaveBeenCalledWith([
      cropped.get(a),
      g,
      cropped.get(c),
    ]);
    expect(vi.mocked(cropImage).mock.calls.map(([f]) => f)).toEqual([a, c]);
  });

  test("GIF survives when every other image is cancelled", async () => {
    const g = gif("a.gif");
    const { onComplete, user } = setup([g, jpg("b.jpg")]);

    await cancel(user);
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith([g]));
  });

  test("GIFs are not counted in N", async () => {
    setup([jpg("a.jpg"), gif("b.gif"), jpg("c.jpg")]);

    expect(await screen.findByText("Image 1 of 2")).toBeDefined();
  });

  test("several GIFs complete at once, in order", async () => {
    const g1 = gif("1.gif");
    const g2 = gif("2.gif");
    const { onComplete } = setup([g1, g2]);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete.mock.calls[0][0]).toEqual([g1, g2]);
  });
});

describe("R6: a photo that can't be shrunk", () => {
  test("toasts the ImageTooLargeError message, drops the image and moves on", async () => {
    const a = jpg("a.jpg");
    const b = jpg("b.jpg");
    vi.mocked(cropImage).mockRejectedValueOnce(tooLarge("a.jpg"));
    const { onComplete, user } = setup([a, b]);

    await apply(user);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Couldn't shrink a.jpg under 5 MB",
      ),
    );
    expect(toast.error).not.toHaveBeenCalledWith("Failed to crop a.jpg");
    expect(await screen.findByText("Image 2 of 2")).toBeDefined();
    await apply(user);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete).toHaveBeenCalledWith([cropped.get(b)]);
  });

  test("a lone image that can't be shrunk completes with nothing", async () => {
    vi.mocked(cropImage).mockRejectedValueOnce(tooLarge("相片 🐶.jpg"));
    const { onComplete, user } = setup([jpg("相片 🐶.jpg")]);

    await apply(user);

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith([]));
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(
      "Couldn't shrink 相片 🐶.jpg under 5 MB",
    );
  });

  test("another error keeps the Failed to crop toast", async () => {
    vi.mocked(cropImage).mockRejectedValueOnce(new Error("decode"));
    const a = jpg("a.jpg");
    const b = jpg("b.jpg");
    const { onComplete, user } = setup([a, b]);

    await apply(user);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to crop a.jpg"),
    );
    await screen.findByText("Image 2 of 2");
    await apply(user);

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([cropped.get(b)]),
    );
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  test("an error with a matching message but another class is still Failed to crop", async () => {
    vi.mocked(cropImage).mockRejectedValueOnce(
      new Error("Couldn't shrink a.jpg under 5 MB"),
    );
    const { onComplete, user } = setup([jpg("a.jpg")]);

    await apply(user);

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith([]));
    expect(toast.error).toHaveBeenCalledWith("Failed to crop a.jpg");
  });

  test("an image the cropper cannot load is toasted and dropped", async () => {
    const { onComplete } = setup([jpg("broken.jpg"), jpg("b.jpg")]);

    await mounted();
    markDone();
    act(() => {
      (
        cropper.props.mediaProps as { onError?: () => void } | undefined
      )?.onError?.();
    });

    expect(toast.error).toHaveBeenCalledWith("Failed to crop broken.jpg");
    expect(await screen.findByText("Image 2 of 2")).toBeDefined();
    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe("R8: a successful compression is silent", () => {
  test("no toast beyond the caller's", async () => {
    const { onComplete, user } = setup([jpg("big.jpg")]);

    await apply(user);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe("R10: files are made decodable before the preview", () => {
  test("each non-GIF file goes through toDecodable, GIFs never do", async () => {
    const a = jpg("a.jpg");
    const g = gif("g.gif");
    const h = heic("IMG_0001.HEIC");
    const { onComplete, user } = setup([a, g, h]);

    await apply(user);
    await screen.findByText("Image 2 of 2");
    await apply(user);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    const inputs = vi.mocked(toDecodable).mock.calls.map(([file]) => file);
    expect(new Set(inputs)).toEqual(new Set([a, h]));
    expect(inputs).not.toContain(g);
  });

  test("the preview and cropImage use the decoded file", async () => {
    const h = heic("IMG_0001.HEIC");
    const out = new File(["jpeg"], "IMG_0001.jpg", { type: "image/jpeg" });
    vi.mocked(toDecodable).mockImplementation(async (file) => {
      if (file !== h) return file;
      decoded.set(file, out);
      return out;
    });
    const { onComplete, user } = setup([h]);

    await apply(user);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    // Files compare equal by value, so check identity.
    const previewed = vi.mocked(URL.createObjectURL).mock.calls.map(([o]) => o);
    expect(previewed).toContain(out);
    expect(previewed).not.toContain(h);
    expect(vi.mocked(cropImage).mock.calls[0][0]).toBe(out);
    expect(vi.mocked(cropImage).mock.calls[0][1]).toEqual(AREA);
    expect(onComplete).toHaveBeenCalledWith([cropped.get(out)]);
  });

  test("the cropper shows nothing until the file is decoded", async () => {
    let finish: (file: File) => void = () => undefined;
    const h = heic("IMG_0001.HEIC");
    vi.mocked(toDecodable).mockImplementationOnce(
      () => new Promise<File>((resolve) => (finish = resolve)),
    );
    const out = new File(["jpeg"], "IMG_0001.jpg", { type: "image/jpeg" });
    const { onComplete, user } = setup([h]);

    await waitFor(() => expect(toDecodable).toHaveBeenCalledTimes(1));
    expect(cropper.props).toBeUndefined();
    expect(
      vi.mocked(URL.createObjectURL).mock.calls.map(([o]) => o),
    ).not.toContain(h);

    await act(async () => finish(out));
    await apply(user);
    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([cropped.get(out)]),
    );
  });
});

describe("R11: decode failure", () => {
  test("toasts Failed to crop with the picked name, drops the file and moves on", async () => {
    const h = heic("IMG_0001.HEIC");
    const b = jpg("b.jpg");
    vi.mocked(toDecodable).mockImplementation(async (file) => {
      if (file === h) throw new Error("libheif failed");
      return file;
    });
    const { onComplete, user } = setup([h, b]);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to crop IMG_0001.HEIC"),
    );
    await apply(user);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete).toHaveBeenCalledWith([cropped.get(b)]);
    expect(vi.mocked(cropImage).mock.calls.map(([f]) => f)).toEqual([b]);
  });

  test("a lone file that can't be decoded completes with nothing", async () => {
    vi.mocked(toDecodable).mockRejectedValue(new Error("libheif failed"));
    const { onComplete } = setup([heic("相片.heic")]);

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith([]));
    expect(toast.error).toHaveBeenCalledWith("Failed to crop 相片.heic");
    expect(cropImage).not.toHaveBeenCalled();
  });

  test("a GIF next to an undecodable file still comes through", async () => {
    vi.mocked(toDecodable).mockRejectedValue(new Error("libheif failed"));
    const g = gif("g.gif");
    const { onComplete } = setup([heic("a.heic"), g]);

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith([g]));
  });
});

describe("R13: GIFs over the limit", () => {
  test("a GIF over maxImageBytes is dropped with an info toast", async () => {
    const { onComplete } = setup([gif("huge.gif", maxImageBytes + 1)]);

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith([]));
    expect(toast.info).toHaveBeenCalledWith(
      "Images size need to be smaller than 5 MB.",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(cropImage).not.toHaveBeenCalled();
  });

  test("a GIF of exactly maxImageBytes is kept", async () => {
    const g = gif("edge.gif", maxImageBytes);
    const { onComplete } = setup([g]);

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith([g]));
    expect(toast.info).not.toHaveBeenCalled();
  });

  test("other files in the batch carry on", async () => {
    const small = gif("small.gif");
    const a = jpg("a.jpg");
    const { onComplete, user } = setup([
      gif("huge.gif", maxImageBytes + 1),
      a,
      small,
    ]);

    await waitFor(() =>
      expect(toast.info).toHaveBeenCalledWith(
        "Images size need to be smaller than 5 MB.",
      ),
    );
    await apply(user);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete).toHaveBeenCalledWith([cropped.get(a), small]);
  });

  test("a large JPEG is not dropped before cropping", async () => {
    const big = new File(["x"], "big.jpg", { type: "image/jpeg" });
    Object.defineProperty(big, "size", { value: maxImageBytes * 4 });
    const { onComplete, user } = setup([big]);

    await apply(user);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(toast.info).not.toHaveBeenCalled();
    expect(cropImage).toHaveBeenCalledWith(big, AREA);
  });
});

describe("R12: Apply button state", () => {
  test("disabled until the cropper reports an area", async () => {
    setup([jpg("a.jpg")]);
    const applyButton = await screen.findByRole("button", { name: "Apply" });

    expect(applyButton).toHaveProperty("disabled", true);
    await report();
    expect(applyButton).toHaveProperty("disabled", false);
  });

  test("disabled while the cropped file is produced", async () => {
    let finish: (file: File) => void = () => undefined;
    vi.mocked(cropImage).mockImplementationOnce(
      () => new Promise<File>((resolve) => (finish = resolve)),
    );
    const { onComplete, user } = setup([jpg("a.jpg")]);

    await apply(user);
    const applyButton = screen.getByRole("button", { name: "Apply" });
    expect(applyButton).toHaveProperty("disabled", true);
    await user.click(applyButton);
    expect(cropImage).toHaveBeenCalledTimes(1);

    const out = jpg("a.jpg");
    await act(async () => finish(out));
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith([out]));
  });

  test("disabled again for the next image until it reports an area", async () => {
    const { user } = setup([jpg("a.jpg"), jpg("b.jpg")]);

    await apply(user);
    await screen.findByText("Image 2 of 2");
    await mounted();

    const applyButton = screen.getByRole("button", { name: "Apply" });
    expect(applyButton).toHaveProperty("disabled", true);
    await report();
    expect(applyButton).toHaveProperty("disabled", false);
  });

  test("Escape while cropping does not drop the image or complete twice", async () => {
    let finish: (file: File) => void = () => undefined;
    vi.mocked(cropImage).mockImplementationOnce(
      () => new Promise<File>((resolve) => (finish = resolve)),
    );
    const { onComplete, user } = setup([jpg("a.jpg")]);

    await apply(user);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveProperty(
      "disabled",
      true,
    );
    await user.keyboard("{Escape}");
    expect(onComplete).not.toHaveBeenCalled();

    const out = jpg("a.jpg");
    await act(async () => finish(out));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete).toHaveBeenCalledWith([out]);
  });

  test("the preview object URL is revoked when the image changes", async () => {
    const { user } = setup([jpg("a.jpg"), jpg("b.jpg")]);
    await mounted();
    const first = cropper.props.image;

    await apply(user);
    await screen.findByText("Image 2 of 2");
    await mounted();

    expect(cropper.props.image).not.toBe(first);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(first);
  });
});

describe("today's behaviour kept (white-box)", () => {
  test("cropShape defaults to rect, with no rotation", async () => {
    setup([jpg("a.jpg")], { aspect: 4 / 3 });

    await mounted();
    expect(cropper.props.cropShape ?? "rect").toBe("rect");
    expect(cropper.props.rotation ?? 0).toBe(0);
    expect(cropper.props.onRotationChange).toBeUndefined();
  });

  test("one image plus a GIF shows no counter", async () => {
    setup([gif("a.gif"), jpg("b.jpg")]);

    expect(
      await screen.findByRole("dialog", { name: "Crop image" }),
    ).toBeDefined();
    await mounted();
    expect(screen.queryByText(/Image \d+ of \d+/)).toBeNull();
  });

  test("a new files array mid-queue drops the old queue without completing it", async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();
    const c = jpg("c.jpg");
    const { rerender } = render(
      <ImageCropDialog
        files={[jpg("a.jpg"), jpg("b.jpg")]}
        aspect={1}
        onComplete={onComplete}
      />,
    );

    await apply(user);
    await screen.findByText("Image 2 of 2");
    await mounted();
    markDone();
    rerender(
      <ImageCropDialog files={[c]} aspect={1} onComplete={onComplete} />,
    );

    expect(onComplete).not.toHaveBeenCalled();
    await mounted();
    expect(screen.queryByText(/Image \d+ of \d+/)).toBeNull();
    expect(screen.getByRole("button", { name: "Apply" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(cropper.props.zoom).toBe(1);
    await apply(user);
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete).toHaveBeenCalledWith([cropped.get(c)]);
  });
});

describe("decoding and size edges (white-box)", () => {
  test("R6: an oversized HEIC toasts the picked name, not the decoded copy's", async () => {
    const h = heic("IMG_0001.HEIC");
    const out = new File(["jpeg"], "IMG_0001.jpg", { type: "image/jpeg" });
    vi.mocked(toDecodable).mockResolvedValue(out);
    vi.mocked(cropImage).mockRejectedValueOnce(tooLarge("IMG_0001.jpg"));
    const { onComplete, user } = setup([h]);

    await apply(user);

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith([]));
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(
      "Couldn't shrink IMG_0001.HEIC under 5 MB",
    );
  });

  test("Preparing image… shows while a file decodes, then the cropper replaces it", async () => {
    let finish: (file: File) => void = () => undefined;
    vi.mocked(toDecodable).mockImplementationOnce(
      () => new Promise<File>((resolve) => (finish = resolve)),
    );
    setup([heic("IMG_0001.HEIC")]);

    expect(await screen.findByText("Preparing image…")).toBeDefined();
    expect(screen.getByRole("button", { name: "Apply" })).toHaveProperty(
      "disabled",
      true,
    );

    await act(async () =>
      finish(new File(["j"], "IMG_0001.jpg", { type: "image/jpeg" })),
    );
    await mounted();
    expect(screen.queryByText("Preparing image…")).toBeNull();
  });

  test("Cancel while decoding drops the file", async () => {
    vi.mocked(toDecodable).mockImplementationOnce(
      () => new Promise<File>(() => undefined),
    );
    const { onComplete, user } = setup([heic("IMG_0001.HEIC")]);

    await screen.findByText("Preparing image…");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith([]));
  });

  test("a decode that fails after the queue moved on is ignored", async () => {
    let fail: (error: Error) => void = () => undefined;
    vi.mocked(toDecodable).mockImplementationOnce(
      () => new Promise<File>((_, reject) => (fail = reject)),
    );
    const onComplete = vi.fn();
    const user = userEvent.setup();
    const c = jpg("c.jpg");
    const { rerender } = render(
      <ImageCropDialog
        files={[heic("a.heic")]}
        aspect={1}
        onComplete={onComplete}
      />,
    );
    await waitFor(() => expect(toDecodable).toHaveBeenCalledTimes(1));

    rerender(
      <ImageCropDialog files={[c]} aspect={1} onComplete={onComplete} />,
    );
    await act(async () => fail(new Error("late")));

    expect(toast.error).not.toHaveBeenCalled();
    await apply(user);
    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([cropped.get(c)]),
    );
  });

  test("a decode that finishes after the queue moved on never previews", async () => {
    let finish: (file: File) => void = () => undefined;
    vi.mocked(toDecodable).mockImplementationOnce(
      () => new Promise<File>((resolve) => (finish = resolve)),
    );
    const late = new File(["j"], "a.jpg", { type: "image/jpeg" });
    const onComplete = vi.fn();
    const { rerender } = render(
      <ImageCropDialog
        files={[heic("a.heic")]}
        aspect={1}
        onComplete={onComplete}
      />,
    );
    await waitFor(() => expect(toDecodable).toHaveBeenCalledTimes(1));

    rerender(<ImageCropDialog files={[]} aspect={1} onComplete={onComplete} />);
    await act(async () => finish(late));

    expect(
      vi.mocked(URL.createObjectURL).mock.calls.map(([o]) => o),
    ).not.toContain(late);
  });

  test("the preview URL is revoked on unmount", async () => {
    const { unmount } = render(
      <ImageCropDialog
        files={[jpg("a.jpg")]}
        aspect={1}
        onComplete={vi.fn()}
      />,
    );
    await mounted();
    const url = cropper.props.image;

    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
  });

  test("R13: an all-GIF batch keeps the small ones and toasts once", async () => {
    const small = gif("small.gif");
    const { onComplete } = setup([
      gif("huge.gif", maxImageBytes + 1),
      small,
      gif("huge2.gif", maxImageBytes + 1),
    ]);

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith([small]));
    expect(toast.info).toHaveBeenCalledTimes(1);
  });
});
