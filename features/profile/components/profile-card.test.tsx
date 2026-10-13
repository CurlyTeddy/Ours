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
import type { Profile } from "@/features/profile/models/responses";
import { ProfileCard } from "@/features/profile/components/profile-card";

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

const user0: Profile = {
  id: "u1",
  name: "Teddy",
  email: "teddy@example.com",
  imageKey: null,
  imageUrl: null,
};
const jpg = (name: string) => new File([name], name, { type: "image/jpeg" });
const cropped = new Map<File, File>();
let putJson: { image: string | null }[];
let uploaded: string[];

beforeEach(() => {
  vi.clearAllMocks();
  cropped.clear();
  putJson = [];
  uploaded = [];
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
    http.get("/api/profile", () => HttpResponse.json(user0)),
    http.put("/api/profile", async ({ request }) => {
      const body = (await request.json()) as { image: string | null };
      putJson.push(body);
      return HttpResponse.json({
        profile: { ...user0, imageKey: body.image },
        signedUrl: body.image ? "https://r2.test/avatar" : undefined,
      });
    }),
    http.put("https://r2.test/avatar", async ({ request }) => {
      uploaded.push(await request.text());
      return new HttpResponse(null, { status: 200 });
    }),
  );
});

function setup() {
  const user = userEvent.setup();
  const { container } = render(<ProfileCard user={user0} />, { wrapper });
  const input = container.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  return { user, input };
}

const save = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: /save changes/i }));

describe("R1/R5: avatar opens a round 1:1 dialog", () => {
  test("picking an image opens a round 1:1 dialog", async () => {
    const { user, input } = setup();

    await user.upload(input, jpg("me.jpg"));

    expect(
      await screen.findByRole("dialog", { name: "Crop image" }),
    ).toBeDefined();
    expect(cropper.props.aspect).toBe(1);
    expect(cropper.props.cropShape).toBe("round");
  });

  test("Apply previews and saves the cropped image", async () => {
    const me = jpg("me.jpg");
    const { user, input } = setup();

    await user.upload(input, me);
    await user.click(await screen.findByRole("button", { name: "Apply" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expect(URL.createObjectURL).toHaveBeenCalledWith(cropped.get(me));
    await save(user);

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Profile updated successfully!",
      ),
    );
    expect(putJson.map((b) => b.image)).toEqual(["me.jpg"]);
    expect(uploaded).toEqual(["cropped-me.jpg"]);
  });
});

describe("R4: avatar cancel", () => {
  test.each(["Cancel", "Escape"])(
    "%s leaves the preview and form unchanged",
    async (how) => {
      const { user, input } = setup();

      await user.upload(input, jpg("me.jpg"));
      await screen.findByRole("dialog");
      if (how === "Escape") await user.keyboard("{Escape}");
      else await user.click(screen.getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

      expect(cropImage).not.toHaveBeenCalled();
      await save(user);
      await waitFor(() => expect(putJson).toHaveLength(1));
      expect(putJson[0].image).toBeNull();
      expect(uploaded).toEqual([]);
    },
  );
});

describe("R9: avatar crop failure", () => {
  test("toasts and leaves the form unchanged", async () => {
    vi.mocked(cropImage).mockRejectedValueOnce(new Error("decode"));
    const { user, input } = setup();

    await user.upload(input, jpg("me.jpg"));
    await user.click(await screen.findByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to crop me.jpg"),
    );
    await save(user);
    await waitFor(() => expect(putJson).toHaveLength(1));
    expect(putJson[0].image).toBeNull();
  });
});

describe("white-box: avatar replaced twice", () => {
  test("the previous cropped preview URL is revoked", async () => {
    const ids = new WeakMap<object, string>();
    let n = 0;
    vi.mocked(URL.createObjectURL).mockImplementation((obj) => {
      if (!ids.has(obj)) ids.set(obj, `blob:${(n++).toString()}`);
      return ids.get(obj) as string;
    });
    const first = jpg("one.jpg");
    const { user, input } = setup();

    await user.upload(input, first);
    await user.click(await screen.findByRole("button", { name: "Apply" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const firstPreview = ids.get(cropped.get(first) as File);
    expect(firstPreview).toBeDefined();

    await user.upload(input, jpg("two.jpg"));
    await user.click(await screen.findByRole("button", { name: "Apply" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expect(URL.revokeObjectURL).toHaveBeenCalledWith(firstPreview);
  });
});

describe("R11: avatar picking the same file again", () => {
  test("input is reset and the same file reopens the dialog", async () => {
    const me = jpg("me.jpg");
    const { user, input } = setup();

    await user.upload(input, me);
    expect(input.value).toBe("");
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.upload(input, me);
    expect(
      await screen.findByRole("dialog", { name: "Crop image" }),
    ).toBeDefined();
  });
});
