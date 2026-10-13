import { beforeEach, describe, expect, test, vi } from "vitest";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/database-client";
import { authenticate } from "@/features/auth/actions";

const store = new Map<string, number>();
vi.mock("@/lib/database-client", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    session: { create: vi.fn() },
  },
  redis: {
    isReady: true,
    get: (key: string) => Promise.resolve(store.get(key)?.toString() ?? null),
    multi() {
      const chain = {
        incr: (key: string) => {
          store.set(key, (store.get(key) ?? 0) + 1);
          return chain;
        },
        expire: () => chain,
        exec: () => Promise.resolve([]),
      };
      return chain;
    },
    ttl: () => Promise.resolve(600),
    del: (key: string) => Promise.resolve(store.delete(key)),
  },
}));
let ip = "1.1.1.1";
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ set: vi.fn() }),
  headers: () => Promise.resolve(new Headers({ "x-forwarded-for": ip })),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const password = "correct-horse";
const hash = bcrypt.hashSync(password, 4);

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  ip = "1.1.1.1";
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
  formData.set("email", "teddy@example.com");
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

describe("authenticate throttle", () => {
  const tryLogin = (pw: string) => {
    const formData = new FormData();
    formData.set("email", "girlfriend@example.com");
    formData.set("password", pw);
    formData.set("redirectTo", "/moments");
    return authenticate(undefined, formData);
  };

  test("blocks the 6th attempt after 5 failures from one IP", async () => {
    for (let i = 0; i < 5; i++) {
      expect(await tryLogin("wrong-password")).toBe("Invalid credential.");
    }

    expect(await tryLogin(password)).toMatch(/^Too many requests/);
    expect(redirect).not.toHaveBeenCalled();
  });

  test("failures from another IP do not lock the user out", async () => {
    ip = "6.6.6.6";
    for (let i = 0; i < 5; i++) await tryLogin("wrong-password");

    ip = "1.1.1.1";
    await tryLogin(password);

    expect(redirect).toHaveBeenCalledWith("/moments");
  });

  test("a successful login clears the failures", async () => {
    for (let i = 0; i < 4; i++) await tryLogin("wrong-password");
    await tryLogin(password);
    for (let i = 0; i < 4; i++) await tryLogin("wrong-password");

    expect(await tryLogin("wrong-password")).toBe("Invalid credential.");
  });
});
