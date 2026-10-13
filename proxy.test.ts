import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { validateSessionToken } from "@/features/auth/session";
import { proxy } from "@/proxy";

vi.mock("@/features/auth/session", () => ({ validateSessionToken: vi.fn() }));

beforeEach(() => {
  vi.mocked(validateSessionToken).mockResolvedValue({
    session: null,
    user: null,
  });
});

describe("proxy without a session", () => {
  test("API requests get a 401 JSON answer", async () => {
    const response = await proxy(new NextRequest("http://localhost/api/todos"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      message: "Invalid or expired session.",
    });
  });

  test("pages redirect to login with a callback", async () => {
    const response = await proxy(new NextRequest("http://localhost/twodo"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?callbackUrl=/twodo",
    );
  });
});
