import { beforeEach, describe, expect, test, vi } from "vitest";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/database-client";
import { encodeHexLowerCase } from "@oslojs/encoding";
import { sha256 } from "@oslojs/crypto/sha2";
import { authenticate, register, signOutAction } from "@/features/auth/actions";

const store = new Map<string, number>();
vi.mock("@/lib/database-client", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    session: { create: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    inviteCode: { findFirst: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
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
const jar = vi.hoisted(() => ({
  token: undefined as string | undefined,
  set: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      set: jar.set,
      get: (name: string) =>
        name === "session" && jar.token !== undefined
          ? { name, value: jar.token }
          : undefined,
      delete: jar.delete,
    }),
  headers: () => Promise.resolve(new Headers({ "x-forwarded-for": ip })),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const password = "correct-horse";
const hash = bcrypt.hashSync(password, 4);

beforeEach(() => {
  vi.clearAllMocks();
  jar.token = undefined;
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

const hashOf = (token: string) =>
  encodeHexLowerCase(sha256(new TextEncoder().encode(token)));

describe("R1: signOutAction", () => {
  test("deletes the session row by hashed token, deletes the cookie, redirects to /", async () => {
    jar.token = "tok-123";
    vi.mocked(prisma.session.deleteMany).mockResolvedValue({ count: 1 });

    await signOutAction();

    expect(prisma.session.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { sessionId: hashOf("tok-123") },
    });
    expect(prisma.session.delete).not.toHaveBeenCalled();
    expect(jar.delete).toHaveBeenCalledWith("session");
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith("/");
  });

  test("a row that is already gone does not throw and still redirects to /", async () => {
    jar.token = "stale-token";
    vi.mocked(prisma.session.deleteMany).mockResolvedValue({ count: 0 });

    await expect(signOutAction()).resolves.not.toThrow();

    expect(jar.delete).toHaveBeenCalledWith("session");
    expect(redirect).toHaveBeenCalledWith("/");
  });

  test("no session cookie: skips the DB and still redirects to /", async () => {
    await signOutAction();

    expect(prisma.session.deleteMany).not.toHaveBeenCalled();
    expect(prisma.session.delete).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith("/");
  });

  test.each(["", "密碼🐻", "x".repeat(4096)])(
    "token %#: hashes it as-is",
    async (token) => {
      jar.token = token;
      vi.mocked(prisma.session.deleteMany).mockResolvedValue({ count: 1 });

      await signOutAction();

      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { sessionId: hashOf(token) },
      });
      expect(redirect).toHaveBeenCalledWith("/");
    },
  );

  test("never redirects to /login", async () => {
    jar.token = "tok";
    vi.mocked(prisma.session.deleteMany).mockResolvedValue({ count: 1 });
    await signOutAction();
    jar.token = undefined;
    await signOutAction();

    expect(vi.mocked(redirect).mock.calls.flat()).not.toContain("/login");
  });
});

describe("R2: register", () => {
  const signup = (fields: Partial<Record<string, string>> = {}) => {
    const formData = new FormData();
    const values = {
      email: "girlfriend@example.com",
      username: "sweetie1",
      password: "password123",
      inviteCode: "INVITE",
      ...fields,
    };
    for (const [k, v] of Object.entries(values)) {
      if (v !== undefined) formData.set(k, v);
    }
    return register({}, formData);
  };
  const txn = {
    inviteCode: { findFirst: vi.fn(), update: vi.fn() },
    user: { create: vi.fn() },
  };

  beforeEach(() => {
    vi.mocked(prisma.$transaction).mockImplementation(((
      cb: (t: typeof txn) => unknown,
    ) => cb(txn)) as never);
    txn.inviteCode.findFirst.mockResolvedValue({
      code: "INVITE",
      usedAt: null,
      expireAt: new Date(Date.now() + 60_000),
    });
  });

  test("success redirects to /", async () => {
    await signup();

    expect(txn.user.create).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith("/");
  });

  test("an invalid invite code returns the error and does not redirect", async () => {
    txn.inviteCode.findFirst.mockResolvedValue(null);

    const state = await signup();

    expect(state.message).toBe("Invalid invite code. Please check your input.");
    expect(redirect).not.toHaveBeenCalled();
  });

  test("a bad form returns the format error and does not redirect", async () => {
    const state = await signup({ email: "not-an-email" });

    expect(state.message).toBe(
      "Incorrect form format. Please check your input.",
    );
    expect(redirect).not.toHaveBeenCalled();
  });

  test("a database error returns the message and does not redirect", async () => {
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const state = await signup();

    expect(state.message).toBe("Database error: Failed to create a user.");
    expect(redirect).not.toHaveBeenCalled();
  });
});
