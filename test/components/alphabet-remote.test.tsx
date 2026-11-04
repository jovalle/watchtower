import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AlphabetSidebar } from "~/components/library/AlphabetSidebar";
import { useRemoteNavigation } from "~/hooks/useRemoteNavigation";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("leaves remote arrows to the native letter selector without jumping early", () => {
  const jump = vi.fn();
  function Page() { useRemoteNavigation(); return <AlphabetSidebar availableLetters={["A", "B"]} onLetterClick={jump} />; }
  render(<Page />);
  const letters = screen.getByRole("combobox", { name: "Jump to Letter" });
  letters.focus();
  expect(fireEvent.keyDown(letters, { key: "ArrowDown" })).toBe(true);
  expect(letters).toHaveFocus();
  expect(jump).not.toHaveBeenCalled();
  fireEvent.change(letters, { target: { value: "B" } });
  expect(jump).toHaveBeenCalledExactlyOnceWith("B");
});
