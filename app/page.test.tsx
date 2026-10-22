import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("next/font/google", () => {
  const font = () => () => ({ className: "f", variable: "f", style: {} });
  return {
    Corben: font(),
    Gaegu: font(),
    Nunito: font(),
    Playpen_Sans: font(),
  };
});
vi.mock("@/features/storybook/components/storybook", () => ({
  default: ({ login }: { login: ReactNode }) => (
    <div data-testid="storybook">{login}</div>
  ),
}));
vi.mock("@/features/auth/components/storybook-login-dialog", () => ({
  default: () => <button type="button">login-dialog</button>,
}));

import Home from "@/app/page";

describe("R1: landing page", () => {
  test("renders only the storybook, with the login dialog in its slot", () => {
    const { container } = render(<Home />);
    const book = screen.getByTestId("storybook");
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild).toBe(book);
    expect(book.textContent).toBe("login-dialog");
  });
});
