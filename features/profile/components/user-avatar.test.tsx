import { beforeEach, describe, expect, test, vi } from "vitest";
import { render } from "@testing-library/react";
import type { Profile } from "@/features/profile/models/responses";

const state = vi.hoisted(() => ({
  user: undefined as Profile | null | undefined,
  replace: vi.fn(),
}));
vi.mock("@/features/profile/hooks/user", () => ({
  useUser: () => ({ user: state.user, isLoading: false, mutate: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: state.replace,
    refresh: vi.fn(),
    back: vi.fn(),
  }),
}));

import UserAvatar from "@/features/profile/components/user-avatar";

beforeEach(() => {
  state.replace.mockClear();
});

describe("R5: user avatar sends a logged-out user to /", () => {
  test("user === null replaces the route with /", () => {
    state.user = null;
    render(<UserAvatar />);

    expect(state.replace).toHaveBeenCalledWith("/");
    expect(state.replace).not.toHaveBeenCalledWith("/login");
  });

  test("user still loading (undefined) does not redirect", () => {
    state.user = undefined;
    render(<UserAvatar />);

    expect(state.replace).not.toHaveBeenCalled();
  });

  test("a loaded user does not redirect", () => {
    state.user = {
      id: "u1",
      name: "Teddy",
      email: "teddy@example.com",
      imageKey: null,
      imageUrl: null,
    };
    render(<UserAvatar />);

    expect(state.replace).not.toHaveBeenCalled();
  });
});
