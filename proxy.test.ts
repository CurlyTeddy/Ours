import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { validateSessionToken } from "@/features/auth/session";
import { proxy } from "@/proxy";

vi.mock("@/features/auth/session", () => ({ validateSessionToken: vi.fn() }));

const loggedIn = () =>
  vi.mocked(validateSessionToken).mockResolvedValue({
    session: { sessionId: "s1" },
    user: { userId: "u1" },
  } as never);

beforeEach(() => {
  vi.mocked(validateSessionToken).mockResolvedValue({
    session: null,
    user: null,
  });
});

// NextResponse.next() carries this header; a redirect carries a location instead.
const passedThrough = (response: Response) =>
  response.headers.get("x-middleware-next") === "1" &&
  response.headers.get("location") === null;

describe("R3: logged-out protected pages redirect to / with a callback", () => {
  test("API requests get a 401 JSON answer", async () => {
    const response = await proxy(new NextRequest("http://localhost/api/todos"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      message: "Invalid or expired session.",
    });
  });

  test.each(["/api/todos/abc", "/api/profile", "/api/moments/notes"])(
    "API path %s keeps the 401 JSON",
    async (path) => {
      const response = await proxy(new NextRequest(`http://localhost${path}`));

      expect(response.status).toBe(401);
      expect(response.headers.get("location")).toBeNull();
    },
  );

  test("/twodo redirects to /?callbackUrl=/twodo", async () => {
    const response = await proxy(new NextRequest("http://localhost/twodo"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/?callbackUrl=/twodo",
    );
  });

  test.each(["/moments", "/map", "/twodo/abc/edit", "/profile"])(
    "%s keeps its pathname unencoded in the callback",
    async (path) => {
      const response = await proxy(new NextRequest(`http://localhost${path}`));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        `http://localhost/?callbackUrl=${path}`,
      );
    },
  );

  test("the original query string is dropped", async () => {
    const response = await proxy(
      new NextRequest("http://localhost/twodo?tab=done"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost/?callbackUrl=/twodo",
    );
  });

  test("a non-GET page request also redirects", async () => {
    const response = await proxy(
      new NextRequest("http://localhost/moments", { method: "POST" }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/?callbackUrl=/moments",
    );
  });

  test("a session without a user counts as logged out", async () => {
    vi.mocked(validateSessionToken).mockResolvedValue({
      session: { sessionId: "s1" },
      user: null,
    } as never);

    const response = await proxy(new NextRequest("http://localhost/twodo"));

    expect(response.headers.get("location")).toBe(
      "http://localhost/?callbackUrl=/twodo",
    );
  });
});

describe("R4: /signup kept, /login no longer special", () => {
  test("/signup logged in goes to /moments", async () => {
    loggedIn();
    const response = await proxy(new NextRequest("http://localhost/signup"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/moments");
  });

  test("/signup logged out passes through", async () => {
    const response = await proxy(new NextRequest("http://localhost/signup"));

    expect(passedThrough(response)).toBe(true);
  });

  test("/login logged in passes through (no redirect to /moments)", async () => {
    loggedIn();
    const response = await proxy(new NextRequest("http://localhost/login"));

    expect(passedThrough(response)).toBe(true);
  });

  test("/login logged out redirects like any protected page", async () => {
    const response = await proxy(new NextRequest("http://localhost/login"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/?callbackUrl=/login",
    );
  });

  test("/signup with a session but no user passes through", async () => {
    vi.mocked(validateSessionToken).mockResolvedValue({
      session: { sessionId: "s1" },
      user: null,
    } as never);
    const response = await proxy(new NextRequest("http://localhost/signup"));

    expect(passedThrough(response)).toBe(true);
  });

  test("a logged-in GET to a protected page passes through", async () => {
    loggedIn();
    const response = await proxy(new NextRequest("http://localhost/twodo"));

    expect(passedThrough(response)).toBe(true);
  });
});
