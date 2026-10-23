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
import { useNotes } from "@/features/moments/hooks/use-notes";
import type { Note } from "@/features/moments/models/responses";

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

const note: Note = {
  noteId: "n1",
  text: "hello",
  color: "mist",
  pattern: "plain",
  photoKey: null,
  photoUrl: null,
  song: null,
  place: {
    name: "Taipei",
    address: "Taipei City, Taiwan",
    placeId: "place-taipei",
    latitude: 25.03,
    longitude: 121.56,
  },
  date: null,
  x: 10,
  y: 20,
  rotation: 0,
  z: 0,
  author: { id: "u1", name: "Teddy", imageUrl: null },
  createdAt: "2026-10-01T00:00:00.000Z",
};

describe("R31: useNotes", () => {
  test("exposes the key and an empty list before data arrives, then the notes", async () => {
    server.use(
      http.get("/api/moments/notes", () =>
        HttpResponse.json({ notes: [note] }),
      ),
    );
    const { result } = renderHook(() => useNotes(), { wrapper });

    expect(result.current.key).toBe("/api/moments/notes");
    expect(result.current.notes).toEqual([]);
    await waitFor(() => expect(result.current.notes).toEqual([note]));
    expect(toast.error).not.toHaveBeenCalled();
  });

  test("a failed fetch toasts an error and keeps an empty list", async () => {
    server.use(
      http.get("/api/moments/notes", () =>
        HttpResponse.json(
          { message: "Failed to fetch notes" },
          { status: 500 },
        ),
      ),
    );
    const { result } = renderHook(() => useNotes({ errorRetryCount: 0 }), {
      wrapper,
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(result.current.notes).toEqual([]);
  });
});
