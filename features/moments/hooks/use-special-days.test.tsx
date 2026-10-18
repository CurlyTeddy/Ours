import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { SWRConfig } from "swr";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { useSpecialDays } from "@/features/moments/hooks/use-special-days";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => server.close());
const wrapper = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
    {children}
  </SWRConfig>
);

const halloween = {
  specialDayId: "sd1",
  name: "Halloween",
  month: 10,
  day: 31,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("useSpecialDays", () => {
  test("exposes the key and an empty list before data arrives, then the days", async () => {
    server.use(
      http.get("/api/moments/special-days", () =>
        HttpResponse.json({ specialDays: [halloween] }),
      ),
    );
    const { result } = renderHook(() => useSpecialDays(), { wrapper });

    expect(result.current.key).toBe("/api/moments/special-days");
    expect(result.current.specialDays).toEqual([]);
    await waitFor(() =>
      expect(result.current.specialDays).toEqual([halloween]),
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  test("a failed fetch toasts an error and keeps an empty list", async () => {
    server.use(
      http.get(
        "/api/moments/special-days",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    const { result } = renderHook(
      () => useSpecialDays({ errorRetryCount: 0 }),
      { wrapper },
    );

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(result.current.specialDays).toEqual([]);
  });
});
