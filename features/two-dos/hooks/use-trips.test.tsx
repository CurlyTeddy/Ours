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
import { useTrips } from "@/features/two-dos/hooks/use-trips";

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

const japan = {
  id: "trip1",
  name: "Japan",
  startDate: "2025-12-20",
  endDate: "2026-01-05",
  position: 1,
};

describe("useTrips", () => {
  test("exposes the key and an empty list first, then the trips", async () => {
    server.use(
      http.get("/api/trips", () => HttpResponse.json({ trips: [japan] })),
    );
    const { result } = renderHook(() => useTrips(), { wrapper });

    expect(result.current.key).toBe("/api/trips");
    expect(result.current.trips).toEqual([]);
    await waitFor(() => expect(result.current.trips).toEqual([japan]));
    expect(typeof result.current.mutate).toBe("function");
    expect(toast.error).not.toHaveBeenCalled();
  });

  test("a failed fetch toasts the error and keeps an empty list", async () => {
    server.use(
      http.get("/api/trips", () =>
        HttpResponse.json(
          { message: "Failed to fetch trips. Please try again later." },
          { status: 500 },
        ),
      ),
    );
    const { result } = renderHook(
      () => useTrips({ errorRetryCount: 0, shouldRetryOnError: false }),
      { wrapper },
    );

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(result.current.trips).toEqual([]);
  });
});
