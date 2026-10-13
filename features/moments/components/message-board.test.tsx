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
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { SWRConfig } from "swr";
import type { ReactNode } from "react";
import { MessageBoard } from "@/features/moments/components/message-board";

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

let posted: string[];

beforeEach(() => {
  posted = [];
  server.use(
    http.get("/api/moments/messages", () =>
      HttpResponse.json({ messages: [], nextCursor: null, totalCount: 0 }),
    ),
    http.post("/api/moments/messages", async ({ request }) => {
      const { content } = (await request.json()) as { content: string };
      posted.push(content);
      return HttpResponse.json({
        messageId: "m1",
        content,
        createdAt: new Date().toISOString(),
        updateAt: new Date().toISOString(),
        author: "Teddy",
        authorImage: null,
      });
    }),
  );
});

async function setup() {
  const user = userEvent.setup();
  render(<MessageBoard />, { wrapper });
  const input = await screen.findByPlaceholderText("Write a message...");
  await user.type(input, "ㄨㄛˇ");
  return { user, input };
}

describe("MessageBoard Enter key", () => {
  test("Enter sends the message", async () => {
    const { user } = await setup();

    await user.keyboard("{Enter}");

    await waitFor(() => expect(posted).toEqual(["ㄨㄛˇ"]));
  });

  test.each([
    ["isComposing", { isComposing: true }],
    ["keyCode 229 (Safari)", { keyCode: 229 }],
  ])(
    "Enter confirming an IME candidate (%s) does not send",
    async (_, init) => {
      const { input } = await setup();

      fireEvent.keyDown(input, { key: "Enter", ...init });

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(posted).toEqual([]);
    },
  );
});
