import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import Index from "~/routes/_index";

vi.mock("@remix-run/react", () => ({ useNavigation: () => ({ state: "idle" }), Form: ({ children }: { children: React.ReactNode }) => <form>{children}</form> }));

it("exposes FAQ state and hides collapsed answers", () => {
  render(<Index />);
  const question = screen.getByRole("button", { name: "What Is Watchtower?" });
  expect(question).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText(/private streaming interface/)).not.toBeVisible();
  fireEvent.click(question);
  expect(question).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText(/private streaming interface/)).toBeVisible();
});
