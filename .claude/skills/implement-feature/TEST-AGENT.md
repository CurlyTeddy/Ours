# Test writer brief

You write Vitest tests for the feature in the spec you were given. `*.test.ts(x)` files are yours; the builder works on everything else at the same time. Each message names your phase.

Each report is under 300 words and contains:
- the test files;
- the cases per requirement;
- **spec gaps** (anything you had to guess);
- **Lessons**: each fix that took more than one attempt, with its cause.

## Setup (already done, don't redo)

- `vitest.config.mts`: jsdom, `globals: true` (React Testing Library auto-cleanup depends on it), `@/` paths, and `NEXT_PUBLIC_ENVIRONMENT=dev`. `.env` is not loaded, and under jsdom `lib/env.ts` validates client vars only: reading a server var throws unless `@/lib/env` is mocked with that key.
- `vitest.setup.ts` makes relative URLs like `ky.get("/api/x")` and `fetch("/api/x")` resolve against `http://localhost:3000`, as in a browser.
- `vitest.setup.ts` also stubs `ResizeObserver`, `IntersectionObserver` and `matchMedia`, which jsdom lacks and the Embla carousel needs. A package fake shared by several test files goes in root `__mocks__/<pkg>.tsx` (used by `vi.mock("<pkg>")` with no factory), e.g. `__mocks__/react-easy-crop.tsx`.
- Installed: `@testing-library/react`, `@testing-library/user-event`, `msw`, `vitest-mock-extended`.
- Run `pnpm test run <paths>`. Import `describe`, `test`, `expect` and `vi` from `"vitest"`.
- Before you report, run `pnpm exec eslint --fix <your files>`. Lint only your own files, so you don't rewrite the builder's.
- Put tests next to the code: `foo.ts` → `foo.test.ts`, and `app/api/x/route.ts` → `app/api/x/route.test.ts`.

## Layers

- **Unit**: pure functions and the Zod schemas in `features/<f>/models/`.
- **Component**: render client components with React Testing Library. Query the way a user perceives the page (`getByRole`, `getByLabelText`) and interact with `userEvent`. Async Server Components cannot render in Vitest, so test the helpers they call and leave the page to e2e. This recipe for SWR + ky data is proven:

```tsx
import { afterAll, afterEach, beforeAll, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { SWRConfig } from "swr";
import type { ReactNode } from "react";

const server = setupServer();
// msw 3 renamed onUnhandledRequest; the old key type-errors and only warns
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
// A fresh SWR cache per test; the global cache leaks data between tests.
const wrapper = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
);
// Components that call useRouter/useSearchParams need this outside the Next.js runtime.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

// in a test:
server.use(http.get("/api/todos", () => HttpResponse.json({ todos: [] })));
render(<TwodoTable />, { wrapper });
expect(await screen.findByRole("table")).toBeDefined();
```

- **Integration**: import the route handlers and call them with `new NextRequest("http://localhost/api/x", { method, body: JSON.stringify(...) })`. Importing a route pulls in `lib/env.ts` (server vars throw under jsdom) and `lib/database-client.ts` (connects to Redis at import), so mock both. Add to the env mock every key the route reads. This recipe is proven:

```ts
import { beforeEach, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

const db = vi.hoisted(() => ({ prisma: undefined as unknown }));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_ENVIRONMENT: "dev" } }));
vi.mock("@/lib/database-client", async () => {
  const { mockDeep } = await import("vitest-mock-extended");
  db.prisma = mockDeep<PrismaClient>();
  return { prisma: db.prisma, redis: mockDeep() };
});
vi.mock("@/lib/s3-client", () => ({ default: {}, getCachedSignedUrl: vi.fn(async () => "https://signed") }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: () => ({ value: "token" }) })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/auth/session", () => ({ validateSessionToken: vi.fn() }));

import { GET } from "@/app/api/todos/route";
const prisma = () => db.prisma as ReturnType<typeof mockDeep<PrismaClient>>;
beforeEach(() => mockReset(prisma()));
```

Fixtures must include every relation the handler reads (for example `createdBy`). A missing relation turns into a caught 500 that looks like a real bug.

## Cases

Every requirement `Rn` gets a `describe("Rn: …")` containing:

- **Happy path**: the main flow, and each output field checked.
- **Boundaries**: min, min−1, max, max+1, empty, whitespace-only, emoji/CJK, very long.
- **Invalid input**: wrong type, missing field, unknown field, malformed JSON. Assert the exact status and error message the spec gives.
- **Combinations**: optional fields present or absent (pairwise), and caller states (logged out, other user's record, already done).
- **Failure paths**: Prisma throws, or an external HTTP call returns 500 or times out, and the user-facing result is what the spec says.

## Phase: black-box

The implementation is being written right now. Code against the spec's **Interfaces** section, and derive expectations only from the spec. Failing runs and "module not found" errors are expected until the builder lands; any other type error is yours to fix. Report spec gaps first.

## Phase: white-box

Read the implementation files you were given. Add tests for every branch, `catch` and condition (both ways) not yet covered, in the same layers. Run `pnpm test run`. For each failure, fix it if the test is wrong. If the code contradicts the spec, report it with the spec line instead of touching the code.
