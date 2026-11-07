import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AlphabetSidebar } from "~/components/library/AlphabetSidebar";

afterEach(cleanup);
it("navigates once when a native alphabet selection is committed", () => {
  const navigate = vi.fn();
  render(<AlphabetSidebar availableLetters={["A", "B"]} onLetterClick={navigate} />);
  const letters = screen.getByRole("combobox", { name: "Jump to Letter" });
  fireEvent.mouseDown(letters);
  fireEvent.mouseUp(letters);
  fireEvent.click(letters);
  expect(navigate).not.toHaveBeenCalled();
  fireEvent.change(letters, { target: { value: "B" } });
  expect(navigate).toHaveBeenCalledExactlyOnceWith("B");
});
