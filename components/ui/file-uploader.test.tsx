import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { cropper } from "@/__mocks__/react-easy-crop";
import { toast } from "sonner";
import { cropImage } from "@/lib/crop-image";
import { FileUploader } from "@/components/ui/file-uploader";

vi.mock("react-easy-crop");
vi.mock("@/lib/crop-image", () => ({ cropImage: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), promise: vi.fn() },
}));

const jpg = (name: string, size = 10) =>
  new File(["x".repeat(size)], name, { type: "image/jpeg" });
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

function setup(props: Partial<Parameters<typeof FileUploader>[0]> = {}) {
  const onValueChange = vi.fn();
  const user = userEvent.setup();
  const { container } = render(
    <FileUploader
      onValueChange={onValueChange}
      multiple
      maxFiles={5}
      maxSize={1000}
      {...props}
    />,
  );
  const input = container.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  return { onValueChange, user, input };
}

const lastValue = (fn: ReturnType<typeof vi.fn>) =>
  fn.mock.calls.at(-1)?.[0] as File[] | undefined;

describe("R1: FileUploader with cropAspect opens the dialog", () => {
  test("accepted files wait for the dialog before reaching the value", async () => {
    const { onValueChange, user, input } = setup({ cropAspect: 4 / 3 });

    await user.upload(input, [jpg("a.jpg"), jpg("b.jpg")]);

    expect(
      await screen.findByRole("dialog", { name: "Crop image" }),
    ).toBeDefined();
    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.queryByText("a.jpg")).toBeNull();
  });

  test("applied files are added to the value in order", async () => {
    const a = jpg("a.jpg");
    const b = jpg("b.jpg");
    const { onValueChange, user, input } = setup({ cropAspect: 4 / 3 });

    await user.upload(input, [a, b]);
    await user.click(await screen.findByRole("button", { name: "Apply" }));
    await screen.findByText("Image 2 of 2");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(onValueChange).toHaveBeenCalled());
    expect(lastValue(onValueChange)).toEqual([cropped.get(a), cropped.get(b)]);
    expect(lastValue(onValueChange)?.[0]).toBe(cropped.get(a));
    expect(await screen.findByText("a.jpg")).toBeDefined();
  });

  test("onUpload gets only the cropped files, after the dialog", async () => {
    const a = jpg("a.jpg");
    const onUpload = vi.fn(async () => undefined);
    const { user, input } = setup({ cropAspect: 4 / 3, onUpload });

    await user.upload(input, [a]);
    await screen.findByRole("dialog");
    expect(onUpload).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    expect(onUpload).toHaveBeenCalledWith([cropped.get(a)]);
  });
});

describe("white-box: FileUploader appends after the dialog", () => {
  test("cropped files are added after the existing value", async () => {
    const existing = jpg("old.jpg");
    const a = jpg("a.jpg");
    const { onValueChange, user, input } = setup({
      cropAspect: 4 / 3,
      value: [existing],
    });

    await user.upload(input, [a]);
    await user.click(await screen.findByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(onValueChange).toHaveBeenCalledWith([existing, cropped.get(a)]),
    );
  });
});

describe("R4: FileUploader cancel", () => {
  test("cancelling everything leaves the value and onUpload untouched", async () => {
    const onUpload = vi.fn(async () => undefined);
    const { onValueChange, user, input } = setup({
      cropAspect: 4 / 3,
      onUpload,
    });

    await user.upload(input, [jpg("a.jpg")]);
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onValueChange).not.toHaveBeenCalled();
    expect(onUpload).not.toHaveBeenCalled();
    expect(toast.promise).not.toHaveBeenCalled();
  });

  test("a cancelled file is skipped, the rest are added", async () => {
    const b = jpg("b.jpg");
    const { onValueChange, user, input } = setup({ cropAspect: 4 / 3 });

    await user.upload(input, [jpg("a.jpg"), b]);
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    await screen.findByText("Image 2 of 2");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(onValueChange).toHaveBeenCalled());
    expect(lastValue(onValueChange)).toEqual([cropped.get(b)]);
  });
});

describe("R5: FileUploader crop shape", () => {
  test("uses the given aspect with a rect frame", async () => {
    const { user, input } = setup({ cropAspect: 4 / 3 });

    await user.upload(input, [jpg("a.jpg")]);
    await screen.findByRole("dialog");

    expect(cropper.props.aspect).toBe(4 / 3);
    expect(cropper.props.cropShape ?? "rect").toBe("rect");
  });
});

describe("R10: FileUploader validation runs before the dialog", () => {
  test("oversized files are rejected and never reach the dialog", async () => {
    const { onValueChange, user, input } = setup({
      cropAspect: 4 / 3,
      maxSize: 5,
    });

    await user.upload(input, [jpg("big.jpg", 50)]);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("File(s) rejected: big.jpg"),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(cropImage).not.toHaveBeenCalled();
    expect(lastValue(onValueChange) ?? []).toEqual([]);
  });

  test("only the accepted files of a mixed pick reach the dialog", async () => {
    const { user, input } = setup({ cropAspect: 4 / 3, maxSize: 20 });

    await user.upload(input, [jpg("ok.jpg", 5), jpg("big.jpg", 50)]);

    expect(await screen.findByRole("dialog")).toBeDefined();
    expect(screen.queryByText(/Image \d+ of \d+/)).toBeNull();
    expect(toast.error).toHaveBeenCalledWith("File(s) rejected: big.jpg");
  });

  test("existing value plus the pick over maxFiles is refused before the dialog", async () => {
    const existing = [jpg("1.jpg"), jpg("2.jpg"), jpg("3.jpg"), jpg("4.jpg")];
    const { user, input } = setup({ cropAspect: 4 / 3, value: existing });

    await user.upload(input, [jpg("a.jpg"), jpg("b.jpg")]);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Cannot upload more than 5 files",
      ),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("too many files are refused before the dialog", async () => {
    const { user, input } = setup({ cropAspect: 4 / 3, maxFiles: 2 });

    await user.upload(input, [jpg("a.jpg"), jpg("b.jpg"), jpg("c.jpg")]);

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(cropImage).not.toHaveBeenCalled();
  });
});

describe("FileUploader without cropAspect is unchanged", () => {
  test("files go straight to the value with no dialog", async () => {
    const a = jpg("a.jpg");
    const { onValueChange, user, input } = setup();

    await user.upload(input, [a]);

    await waitFor(() => expect(onValueChange).toHaveBeenCalled());
    expect(lastValue(onValueChange)).toEqual([a]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(cropImage).not.toHaveBeenCalled();
  });
});
