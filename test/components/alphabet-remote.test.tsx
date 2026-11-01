import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AlphabetSidebar } from "~/components/library/AlphabetSidebar";
const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
afterEach(() => { cleanup(); vi.restoreAllMocks(); if (originalScroll) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScroll); else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView"); });

it("lets remote arrows move focus from a letter to the next letter", async () => {
  const { useRemoteNavigation } = await import("~/hooks/useRemoteNavigation");
  const scroll = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scroll });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const y = this.getAttribute("aria-label") === "Jump to B" ? 40 : this.getAttribute("aria-label") === "Jump to A" ? 20 : 0;
    return { x: 0, y, top: y, left: 0, right: 20, bottom: y + 20, width: 20, height: 20, toJSON() {} };
  });
  function Screen() { useRemoteNavigation(); return <AlphabetSidebar availableLetters={["A", "B"]} onLetterClick={() => {}} />; }
  render(<Screen />);
  screen.getByRole("button", { name: "Jump to A" }).focus();
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  expect(screen.getByRole("button", { name: "Jump to B" })).toHaveFocus();
});
