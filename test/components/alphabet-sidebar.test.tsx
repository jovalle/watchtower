import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AlphabetSidebar } from "~/components/library/AlphabetSidebar";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("navigates once when a mouse clicks an alphabet letter", () => {
  const navigate = vi.fn();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, top: 0, left: 0, right: 20, bottom: 540, width: 20, height: 540, toJSON() {} });
  render(<AlphabetSidebar availableLetters={["A"]} onLetterClick={navigate} />);
  const letter = screen.getByRole("button", { name: "Jump to A" });
  fireEvent.mouseDown(letter, { clientY: 20 });
  fireEvent.mouseUp(letter, { clientY: 20 });
  fireEvent.click(letter);
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledWith("A");
});

it("navigates once to the released letter after a mouse drag", () => {
  const navigate = vi.fn();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, top: 0, left: 0, right: 20, bottom: 540, width: 20, height: 540, toJSON() {} });
  render(<AlphabetSidebar availableLetters={["A", "B"]} onLetterClick={navigate} />);
  fireEvent.mouseDown(screen.getByRole("button", { name: "Jump to A" }), { clientY: 20 });
  fireEvent.mouseMove(document, { clientY: 40 });
  fireEvent.mouseUp(screen.getByRole("button", { name: "Jump to B" }), { clientY: 40 });
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledWith("B");
});