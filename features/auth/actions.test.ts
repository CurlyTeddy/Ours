import { beforeEach, describe, expect, test, vi } from "vitest";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/database-client";
import { authenticate } from "@/features/auth/actions";

vi.mock("@/lib/database-client", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    session: { create: vi.fn() },
  },
}));
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ set: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const password = "correct-horse";
const hash = bcrypt.hashSync(password, 4);
let attempt = 0;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    userId: "u1",
    password: hash,
  } as never);
  vi.mocked(prisma.session.create).mockResolvedValue({
    expireAt: new Date(Date.now() + 60_000),
  } as never);
});

async function loginWith(redirectTo: string) {
  const formData = new FormData();
  // A fresh email per call keeps the login throttle out of the way
  formData.set("email", `user${(attempt++).toString()}@example.com`);
  formData.set("password", password);
  formData.set("redirectTo", redirectTo);
  await authenticate(undefined, formData);
}

describe("authenticate redirect", () => {
  test.each(["/moments", "/twodo/abc/edit"])("keeps %j", async (path) => {
    await loginWith(path);

    expect(redirect).toHaveBeenCalledWith(path);
  });

  test.each(["https://evil.example", "//evil.example", "/\\evil.example", ""])(
    "sends %j to /moments",
    async (target) => {
      await loginWith(target);

      expect(redirect).toHaveBeenCalledWith("/moments");
    },
  );
});
