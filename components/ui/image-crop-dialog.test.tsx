import { beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { Area } from "react-easy-crop";
import { cropper } from "@/__mocks__/react-easy-crop";
import { toast } from "sonner";
import { cropImage } from "@/lib/crop-image";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";

vi.mock("react-easy-crop");
// These tests report crop areas by hand to control when Apply enables.
cropper.autoReport = false;
vi.mock("@/lib/crop-image", () => ({ cropImage: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

const AREA: Area = { x: 12, y: 34, width: 400, height: 300 };
const report = (area: Area = AREA) =>
  act(() => {
    cropper.props.onCropComplete?.(
      { x: 0, y: 0, width: 100, height: 100 },
      area,
    );
  });

const jpg = (name: string) => new File([name], name, { type: "image/jpeg" });
const gif = (name: string) => new File([name], name, { type: "image/gif" });
const cropped = new Map<File, File>();

beforeEach(() => {
  vi.clearAllMocks();
  cropped.clear();
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => "blob:mock");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
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
  report();
  await user.click(screen.getByRole("button", { name: "Apply" }));
};
const cancel = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: "Cancel" }));

describe("R1: dialog opens on selection", () => {
  test("no files: no dialog and no completion", () => {
    const { onComplete } = setup([]);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
  });

  test("one JPEG opens the Crop image dialog and holds the file", () => {
    const { onComplete } = setup([jpg("a.jpg")]);

    expect(screen.getByRole("dialog", { name: "Crop image" })).toBeDefined();
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
  test("only Apply, Cancel and the close (X) button", () => {
    setup([jpg("a.jpg")]);
    const dialog = screen.getByRole("dialog");

    const names = within(dialog)
      .getAllByRole("button")
      .map((b) => b.textContent?.trim())
      .sort();
    expect(names).toEqual(["Apply", "Cancel", "Close"]);
    expect(
      within(dialog).queryByRole("button", { name: /original|skip/i }),
    ).toBeNull();
  });

  test("Escape cancels the current image", async () => {
    const { onComplete, user } = setup([jpg("a.jpg")]);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith([]));
    expect(cropImage).not.toHaveBeenCalled();
  });

  test("the close (X) button cancels the current image", async () => {
    const { onComplete, user } = setup([jpg("a.jpg")]);

    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith([]));
  });

  test("clicking the overlay cancels the current image", async () => {
    const { onComplete, user } = setup([jpg("a.jpg")]);

    const overlay = document.querySelector('[data-slot="dialog-overlay"]');
    expect(overlay).not.toBeNull();
    await user.click(overlay as Element);
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith([]));
  });

  test("Escape with several images drops only the current one", async () => {
    const { onComplete, user } = setup([jpg("a.jpg"), jpg("b.jpg")]);

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
      screen.getByRole("dialog", { description: "Image 1 of 3" }),
    ).toBeDefined();
    await apply(user);
    expect(await screen.findByText("Image 2 of 3")).toBeDefined();
    await cancel(user);
    expect(await screen.findByText("Image 3 of 3")).toBeDefined();
  });

  test("a single image has no counter", () => {
    setup([jpg("a.jpg")]);

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

      act(() => {
        cropper.props.onCropChange({ x: 30, y: -20 });
        cropper.props.onZoomChange?.(2.5);
      });
      expect(cropper.props.zoom).toBe(2.5);
      expect(cropper.props.crop).toEqual({ x: 30, y: -20 });

      if (action === "Apply") await apply(user);
      else await cancel(user);
      await screen.findByText("Image 2 of 2");

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
    expect(screen.getByRole("dialog", { name: "Crop image" })).toBeDefined();
    await apply(user);
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(2));
    expect(onComplete).toHaveBeenLastCalledWith([cropped.get(file)]);
  });
});

describe("R5: aspect ratio and shape", () => {
  test("4:3 with a rectangular frame", () => {
    setup([jpg("a.jpg")], { aspect: 4 / 3, cropShape: "rect" });

    expect(cropper.props.aspect).toBe(4 / 3);
    expect(cropper.props.cropShape ?? "rect").toBe("rect");
  });

  test("cropShape defaults to rect", () => {
    setup([jpg("a.jpg")], { aspect: 4 / 3 });

    expect(cropper.props.cropShape ?? "rect").toBe("rect");
  });

  test("1:1 with a round frame", () => {
    setup([jpg("a.jpg")], { aspect: 1, cropShape: "round" });

    expect(cropper.props.aspect).toBe(1);
    expect(cropper.props.cropShape).toBe("round");
  });
});

describe("R6: controls", () => {
  test("there is no zoom slider", () => {
    setup([jpg("a.jpg")]);

    expect(screen.queryByRole("slider")).toBeNull();
  });

  test("zoom starts at 1", () => {
    setup([jpg("a.jpg")]);

    expect(cropper.props.zoom).toBe(1);
  });

  test("pinch or wheel zoom updates the cropper's zoom", () => {
    setup([jpg("a.jpg")]);

    act(() => cropper.props.onZoomChange?.(2));
    expect(cropper.props.zoom).toBe(2);
    act(() => cropper.props.onZoomChange?.(3));
    expect(cropper.props.zoom).toBe(3);
  });

  test("zoom ranges from 1 to 3", () => {
    setup([jpg("a.jpg")]);

    expect(cropper.props.minZoom).toBe(1);
    expect(cropper.props.maxZoom).toBe(3);
  });

  test("dragging pans the crop", () => {
    setup([jpg("a.jpg")]);

    act(() => cropper.props.onCropChange({ x: -15, y: 8 }));
    expect(cropper.props.crop).toEqual({ x: -15, y: 8 });
  });

  test("no rotation", () => {
    setup([jpg("a.jpg")]);

    expect(cropper.props.rotation ?? 0).toBe(0);
    expect(cropper.props.onRotationChange).toBeUndefined();
  });
});

describe("R7: apply produces the cropped file", () => {
  test("crops the current file with the latest reported pixel area", async () => {
    const a = jpg("a.jpg");
    const { onComplete, user } = setup([a]);
    const latest = { x: 1, y: 2, width: 3, height: 4 };

    report();
    report(latest);
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
});

describe("R9: crop failure", () => {
  test("shows a toast, drops the image and moves on", async () => {
    const a = jpg("a.jpg");
    const b = jpg("b.jpg");
    vi.mocked(cropImage).mockRejectedValueOnce(new Error("decode"));
    const { onComplete, user } = setup([a, b]);

    await apply(user);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to crop a.jpg"),
    );
    expect(await screen.findByText("Image 2 of 2")).toBeDefined();
    await apply(user);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete).toHaveBeenCalledWith([cropped.get(b)]);
  });

  test("a single failed image completes with nothing", async () => {
    vi.mocked(cropImage).mockRejectedValueOnce(new Error("decode"));
    const { onComplete, user } = setup([jpg("相片 🐶.jpg")]);

    await apply(user);
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith([]));
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith("Failed to crop 相片 🐶.jpg");
  });
});

describe("R12: Apply button state", () => {
  test("disabled until the cropper reports an area", () => {
    setup([jpg("a.jpg")]);
    const applyButton = screen.getByRole("button", { name: "Apply" });

    expect(applyButton).toHaveProperty("disabled", true);
    report();
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

    const applyButton = screen.getByRole("button", { name: "Apply" });
    expect(applyButton).toHaveProperty("disabled", true);
    report();
    expect(applyButton).toHaveProperty("disabled", false);
  });
});

describe("white-box: queue edges", () => {
  test("R3: GIFs are not counted in N", async () => {
    setup([jpg("a.jpg"), gif("b.gif"), jpg("c.jpg")]);

    expect(screen.getByText("Image 1 of 2")).toBeDefined();
  });

  test("R3: one image plus a GIF shows no counter", () => {
    setup([gif("a.gif"), jpg("b.jpg")]);

    expect(screen.getByRole("dialog", { name: "Crop image" })).toBeDefined();
    expect(screen.queryByText(/Image \d+ of \d+/)).toBeNull();
  });

  test("R8: several GIFs complete at once, in order", async () => {
    const g1 = gif("1.gif");
    const g2 = gif("2.gif");
    const { onComplete } = setup([g1, g2]);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete.mock.calls[0][0]).toEqual([g1, g2]);
    expect(onComplete.mock.calls[0][0][0]).toBe(g1);
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
    rerender(
      <ImageCropDialog files={[c]} aspect={1} onComplete={onComplete} />,
    );

    expect(onComplete).not.toHaveBeenCalled();
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

  test("R9: an image the cropper cannot load is toasted and dropped", async () => {
    const { onComplete } = setup([jpg("broken.jpg"), jpg("b.jpg")]);

    act(() => {
      (
        cropper.props.mediaProps as { onError?: () => void } | undefined
      )?.onError?.();
    });

    expect(toast.error).toHaveBeenCalledWith("Failed to crop broken.jpg");
    expect(await screen.findByText("Image 2 of 2")).toBeDefined();
    expect(onComplete).not.toHaveBeenCalled();
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
    let n = 0;
    vi.mocked(URL.createObjectURL).mockImplementation(
      () => `blob:${(n++).toString()}`,
    );
    const { user } = setup([jpg("a.jpg"), jpg("b.jpg")]);
    const first = cropper.props.image;

    await apply(user);
    await screen.findByText("Image 2 of 2");

    expect(cropper.props.image).not.toBe(first);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(first);
  });
});
