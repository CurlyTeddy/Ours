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
import { cropImage } from "@/lib/crop-image";
import { CreateButton } from "@/features/two-dos/components/create-button";

vi.mock("react-easy-crop");
vi.mock("@/lib/crop-image", () => ({ cropImage: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), promise: vi.fn() },
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

const jpg = (name: string) => new File([name], name, { type: "image/jpeg" });
let posted: { imageNames: string[] }[];
let uploaded: string[];

beforeEach(() => {
  vi.clearAllMocks();
  posted = [];
  uploaded = [];
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => "blob:mock");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.mocked(cropImage).mockImplementation(
    async (file) =>
      new File([`cropped-${file.name}`], file.name, { type: file.type }),
  );
  server.use(
    http.get("/api/todos", () => HttpResponse.json({ todos: [] })),
    http.post("/api/todos", async ({ request }) => {
      const body = (await request.json()) as { imageNames: string[] };
      posted.push(body);
      return HttpResponse.json({
        signedUrls: body.imageNames.map(
          (_, i) => `https://r2.test/t${i.toString()}`,
        ),
        todo: {
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
          priority: 1,
          images: [],
          createdBy: { name: "Teddy", imageUrl: null },
        },
      });
    }),
    http.put("https://r2.test/:id", async ({ request }) => {
      uploaded.push(await request.text());
      return new HttpResponse(null, { status: 200 });
    }),
  );
});

async function openCreateDialog() {
  const user = userEvent.setup();
  render(<CreateButton />, { wrapper });
  await user.click(screen.getByRole("button", { name: "Add" }));
  await screen.findByRole("dialog", { name: "Add Two Dos" });
  const input = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  return { user, input };
}

describe("R1/R5: Two-do create crops dropped images", () => {
  test("two images are cropped 4:3 one by one, then both are created", async () => {
    const { user, input } = await openCreateDialog();

    await user.upload(input, [jpg("a.jpg"), jpg("b.jpg")]);
    expect(
      await screen.findByRole("dialog", { name: "Crop image" }),
    ).toBeDefined();
    expect(cropper.props.aspect).toBe(4 / 3);
    expect(cropper.props.cropShape ?? "rect").toBe("rect");
    expect(screen.getByText("Image 1 of 2")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Apply" }));
    await screen.findByText("Image 2 of 2");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Crop image" })).toBeNull(),
    );

    expect(screen.getByText("a.jpg")).toBeDefined();
    expect(screen.getByText("b.jpg")).toBeDefined();

    await user.type(screen.getByLabelText("Title"), "Dory");
    await user.click(screen.getByRole("button", { name: "Add Todo" }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].imageNames).toEqual(["a.jpg", "b.jpg"]);
    await waitFor(() => expect(uploaded).toHaveLength(2));
    expect(uploaded.sort()).toEqual(["cropped-a.jpg", "cropped-b.jpg"]);
  });

  test("Escape in the crop dialog keeps the create dialog open", async () => {
    const { user, input } = await openCreateDialog();
    await user.type(screen.getByLabelText("Title"), "Keep me");

    await user.upload(input, [jpg("a.jpg")]);
    await screen.findByRole("dialog", { name: "Crop image" });
    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Crop image" })).toBeNull(),
    );
    expect(screen.getByRole("dialog", { name: "Add Two Dos" })).toBeDefined();
    expect(screen.getByLabelText("Title")).toHaveProperty("value", "Keep me");
    expect(screen.queryByText("a.jpg")).toBeNull();
  });
});
