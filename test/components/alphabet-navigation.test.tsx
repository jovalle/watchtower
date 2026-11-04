import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AlphabetSidebar } from "~/components/library/AlphabetSidebar";

afterEach(cleanup);
it("keeps native alphabet navigation available and disables it without letters", () => {
  const jump = vi.fn(), top = vi.fn();
  const { rerender } = render(<AlphabetSidebar availableLetters={["A", "T"]} onLetterClick={jump} onReturnToTop={top} />);
  fireEvent.change(screen.getByRole("combobox", { name: "Jump to Letter" }), { target: { value: "T" } });
  expect(jump).toHaveBeenCalledWith("T");
  fireEvent.click(screen.getByRole("button", { name: /Return to [Tt]op/ }));
  expect(top).toHaveBeenCalledOnce();
  rerender(<AlphabetSidebar availableLetters={[]} onLetterClick={jump} />);
  expect(screen.getByRole("combobox", { name: "Jump to Letter" })).toBeDisabled();
});
