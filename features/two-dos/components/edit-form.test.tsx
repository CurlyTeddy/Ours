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
import type { Todo } from "@/features/two-dos/models/views";
import EditForm from "@/features/two-dos/components/edit-form";

vi.mock("react-easy-crop");
vi.mock("@/lib/crop-image", () => ({ cropImage: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
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

const todo = (imageCount = 0): Todo => ({
  id: "t1",
  title: "Dory",
  description: null,
  location: {
    name: "Taiwan",
    address: "Taiwan",
    placeId: null,
    latitude: 23.7,
    longitude: 121,
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  doneAt: null,
  createdBy: { name: "Teddy", imageUrl: null },
  images: Array.from({ length: imageCount }, (_, i) => ({
    key: `old${i.toString()}.jpg`,
    url: `https://cdn.test/old${i.toString()}.jpg`,
  })),
  status: false,
});
const jpg = (name: string, size = 0) =>
  new File([size ? new Uint8Array(size) : name], name, { type: "image/jpeg" });
let putNames: string[][];
let uploaded: string[];

beforeEach(() => {
  vi.clearAllMocks();
  putNames = [];
  uploaded = [];
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => "blob:mock");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.mocked(cropImage).mockImplementation(
    async (file) =>
      new File([`cropped-${file.name}`], file.name, { type: file.type }),
  );
  server.use(
    http.get("/api/todos/t1", () =>
      HttpResponse.json({ ...todo(), priority: 1 }),
    ),
    http.put("/api/todos/t1", async ({ request }) => {
      const { imageNames } = (await request.json()) as { imageNames: string[] };
      putNames.push(imageNames);
      return HttpResponse.json({
        todo: { ...todo(), priority: 1 },
        imagesToUpload: imageNames
          .filter((n) => !n.startsWith("old"))
          .map((name) => ({ name, signedUrl: `https://r2.test/${name}` })),
      });
    }),
    http.put("https://r2.test/:name", async ({ request }) => {
      uploaded.push(await request.text());
      return new HttpResponse(null, { status: 200 });
    }),
  );
});

function setup(imageCount = 0) {
  const user = userEvent.setup();
  render(<EditForm todo={todo(imageCount)} />, { wrapper });
  const input = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  return { user, input };
}

describe("R1/R5: Two-do edit crops before adding", () => {
  test("Apply adds the cropped image, toasts, and saves it", async () => {
    const { user, input } = setup();

    await user.upload(input, jpg("a.jpg"));
    expect(
      await screen.findByRole("dialog", { name: "Crop image" }),
    ).toBeDefined();
    expect(cropper.props.aspect).toBe(4 / 3);
    expect(cropper.props.cropShape ?? "rect").toBe("rect");
    expect(toast.success).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Image uploaded successfully!",
      ),
    );
    expect(await screen.findByAltText("a.jpg")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(putNames).toHaveLength(1));
    expect(putNames[0]).toEqual(["0-a.jpg"]);
    await waitFor(() => expect(uploaded).toEqual(["cropped-a.jpg"]));
  });
});

describe("Two-do edit same-named images", () => {
  test("two new files with one name are both uploaded", async () => {
    const { user, input } = setup();

    await user.upload(input, [
      new File(["g1"], "image.gif", { type: "image/gif" }),
      new File(["g2"], "image.gif", { type: "image/gif" }),
    ]);
    await waitFor(() =>
      expect(screen.getAllByAltText("image.gif")).toHaveLength(2),
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(uploaded).toHaveLength(2));
    expect(putNames[0]).toEqual(["0-image.gif", "1-image.gif"]);
    expect(uploaded.sort()).toEqual(["g1", "g2"]);
  });
});

describe("Two-do edit failed upload", () => {
  test("saves again without the new images", async () => {
    server.use(
      http.put(
        "https://r2.test/:name",
        () => new HttpResponse("<Error/>", { status: 500 }),
      ),
    );
    const { user, input } = setup(1);

    await user.upload(
      input,
      new File(["g"], "party.gif", { type: "image/gif" }),
    );
    await screen.findByAltText("party.gif");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(putNames).toHaveLength(2));
    expect(putNames).toEqual([["old0.jpg", "0-party.gif"], ["old0.jpg"]]);
    expect(
      await screen.findByText("Failed to update todo. Please try again later."),
    ).toBeDefined();
  });
});

describe("R4: Two-do edit cancel", () => {
  test("cancel adds nothing and shows no toast", async () => {
    const { user, input } = setup();

    await user.upload(input, jpg("a.jpg"));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.queryByAltText("a.jpg")).toBeNull();
  });
});

describe("R8: Two-do edit GIF", () => {
  test("a GIF is added without the dialog", async () => {
    const { user, input } = setup();

    await user.upload(
      input,
      new File(["g"], "party.gif", { type: "image/gif" }),
    );

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Image uploaded successfully!",
      ),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(cropImage).not.toHaveBeenCalled();
    expect(await screen.findByAltText("party.gif")).toBeDefined();
  });
});

describe("R9: Two-do edit crop failure", () => {
  test("toasts the error and adds nothing", async () => {
    vi.mocked(cropImage).mockRejectedValueOnce(new Error("decode"));
    const { user, input } = setup();

    await user.upload(input, jpg("a.jpg"));
    await user.click(await screen.findByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to crop a.jpg"),
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.queryByAltText("a.jpg")).toBeNull();
  });
});

describe("R10: Two-do edit checks run before the dialog", () => {
  test("4 existing + 2 picked is refused before the dialog", async () => {
    const { user, input } = setup(4);

    await user.upload(input, [jpg("a.jpg"), jpg("b.jpg")]);

    expect(toast.info).toHaveBeenCalledWith(
      "A twodo can only have at most five images.",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    // A refused pick is reset too, so the same files can be picked again
    expect(input.value).toBe("");
  });

  test("4 existing + 1 picked (exactly 5) opens the dialog", async () => {
    const { user, input } = setup(4);

    await user.upload(input, jpg("a.jpg"));

    expect(
      await screen.findByRole("dialog", { name: "Crop image" }),
    ).toBeDefined();
  });

  test("a file over 5 MB is refused before the dialog", async () => {
    const { user, input } = setup();

    await user.upload(input, jpg("big.jpg", 5 * 1024 * 1024 + 1));

    expect(toast.info).toHaveBeenCalledWith(
      "Images size need to be smaller than 5 MB.",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("a file of exactly 5 MB opens the dialog", async () => {
    const { user, input } = setup();

    await user.upload(input, jpg("max.jpg", 5 * 1024 * 1024));

    expect(
      await screen.findByRole("dialog", { name: "Crop image" }),
    ).toBeDefined();
  });
});

describe("R11: Two-do edit picking the same file again", () => {
  test("input is reset and the same file reopens the dialog", async () => {
    const a = jpg("a.jpg");
    const { user, input } = setup();

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
