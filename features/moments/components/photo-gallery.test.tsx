import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { SWRConfig } from "swr";
import type { ReactNode } from "react";
import { cropper } from "@/__mocks__/react-easy-crop";
import { toast } from "sonner";
import { cropImage } from "@/lib/crop-image";
import type { Photo } from "@/features/moments/models/responses";
import { PhotoGallery } from "@/features/moments/components/photo-gallery";

vi.mock("react-easy-crop");
vi.mock("@/lib/crop-image", () => ({ cropImage: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
const wrapper = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
    {children}
  </SWRConfig>
);

const photo = (n: number): Photo => ({
  photoId: `p${n.toString()}`,
  imageKey: `photo${n.toString()}.jpg-abc`,
  imageUrl: `https://cdn.test/p${n.toString()}.jpg`,
  createdAt: "2026-01-01T00:00:00.000Z",
});
const jpg = (name: string) => new File([name], name, { type: "image/jpeg" });
const cropped = new Map<File, File>();

let postedNames: string[][];
let putBodies: string[];
let putTypes: (string | null)[];

beforeEach(() => {
  vi.clearAllMocks();
  cropped.clear();
  postedNames = [];
  putBodies = [];
  putTypes = [];
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => "blob:mock");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.mocked(cropImage).mockImplementation(async (file) => {
    const out = new File([`cropped-${file.name}`], file.name, {
      type: file.type,
    });
    cropped.set(file, out);
    return out;
  });
  server.use(
    http.get("/api/moments/photos", () => HttpResponse.json({ photos: [] })),
    http.post("/api/moments/photos", async ({ request }) => {
      const { imageNames } = (await request.json()) as { imageNames: string[] };
      postedNames.push(imageNames);
      return HttpResponse.json({
        photos: imageNames.map((_, i) => photo(i + 100)),
        uploadUrls: imageNames.map(
          (_, i) => `https://r2.test/u${i.toString()}`,
        ),
      });
    }),
    http.put("https://r2.test/:id", async ({ request }) => {
      putTypes.push(request.headers.get("Content-Type"));
      putBodies.push(await request.text());
      return new HttpResponse(null, { status: 200 });
    }),
  );
});

async function setup() {
  const user = userEvent.setup();
  const { container } = render(<PhotoGallery />, { wrapper });
  await screen.findByRole("button", { name: /upload/i });
  const input = container.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  return { user, input };
}

describe("R1: Moments opens the dialog on selection", () => {
  test("picking an image opens a 4:3 rect dialog and uploads nothing yet", async () => {
    const { user, input } = await setup();

    await user.upload(input, jpg("a.jpg"));

    expect(
      await screen.findByRole("dialog", { name: "Crop image" }),
    ).toBeDefined();
    expect(cropper.props.aspect).toBe(4 / 3);
    expect(cropper.props.cropShape ?? "rect").toBe("rect");
    expect(postedNames).toEqual([]);
  });

  test("Apply uploads the cropped file and shows the success toast", async () => {
    const a = jpg("a.jpg");
    const { user, input } = await setup();

    await user.upload(input, a);
    await user.click(await screen.findByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Photos uploaded successfully!",
      ),
    );
    expect(postedNames).toEqual([["a.jpg"]]);
    expect(putBodies).toEqual(["cropped-a.jpg"]);
    expect(putTypes).toEqual(["image/jpeg"]);
  });
});

describe("R4: Moments cancel", () => {
  test("three picked, middle cancelled: exactly two uploaded in order", async () => {
    const { user, input } = await setup();

    await user.upload(input, [jpg("a.jpg"), jpg("b.jpg"), jpg("c.jpg")]);
    expect(await screen.findByText("Image 1 of 3")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await screen.findByText("Image 2 of 3");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await screen.findByText("Image 3 of 3");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(postedNames).toEqual([["a.jpg", "c.jpg"]]);
    expect(putBodies.sort()).toEqual(["cropped-a.jpg", "cropped-c.jpg"]);
  });

  test.each(["Cancel", "Escape"])(
    "all cancelled via %s: no request and no toast",
    async (how) => {
      const { user, input } = await setup();

      await user.upload(input, jpg("a.jpg"));
      await screen.findByRole("dialog");
      if (how === "Escape") await user.keyboard("{Escape}");
      else await user.click(screen.getByRole("button", { name: "Cancel" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(postedNames).toEqual([]);
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    },
  );
});

describe("R8: Moments GIF", () => {
  test("a GIF uploads unchanged without the dialog", async () => {
    const g = new File(["gif-bytes"], "party.gif", { type: "image/gif" });
    const { user, input } = await setup();

    await user.upload(input, g);

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(postedNames).toEqual([["party.gif"]]);
    expect(putBodies).toEqual(["gif-bytes"]);
  });
});

describe("R9: Moments crop failure", () => {
  test("a failed crop toasts and uploads nothing", async () => {
    vi.mocked(cropImage).mockRejectedValueOnce(new Error("decode"));
    const { user, input } = await setup();

    await user.upload(input, jpg("a.jpg"));
    await user.click(await screen.findByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to crop a.jpg"),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(postedNames).toEqual([]);
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe("R10: Moments limit of 10", () => {
  test("Upload stays disabled at 10 photos", async () => {
    server.use(
      http.get("/api/moments/photos", () =>
        HttpResponse.json({
          photos: Array.from({ length: 10 }, (_, i) => photo(i)),
        }),
      ),
    );
    render(<PhotoGallery />, { wrapper });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /upload/i })).toHaveProperty(
        "disabled",
        true,
      ),
    );
  });
});

describe("R11: Moments picking the same file again", () => {
  test("input is reset and the same file reopens the dialog", async () => {
    const a = jpg("a.jpg");
    const { user, input } = await setup();

    await user.upload(input, a);
    expect(input.value).toBe("");
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.upload(input, a);
    expect(
      await screen.findByRole("dialog", { name: "Crop image" }),
    ).toBeDefined();
  });
});
