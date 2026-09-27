import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PosterCard } from "~/components/media/PosterCard";
import { MediaCard } from "~/components/media/MediaCard";
import { useRemoteNavigation } from "~/hooks/useRemoteNavigation";
const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
afterEach(() => { cleanup(); vi.restoreAllMocks(); if (originalScroll) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScroll); else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView"); });

it("does not open details when keyboard activation bubbles from a card action", () => {
  const details = vi.fn();
  const play = vi.fn();
  render(<MediaCard imageUrl="" title="Example" onClick={details} onPlay={play} />);
  const button = screen.getByRole("button", { name: "Play Example" });
  fireEvent.keyDown(button, { key: "Enter" });
  fireEvent.click(button);
  expect(play).toHaveBeenCalledOnce();
  expect(details).not.toHaveBeenCalled();
});

it("omits Play when a title has no playback action", () => {
  render(<MediaCard imageUrl="" title="External" onClick={() => {}} />);
  expect(screen.queryByRole("button", { name: "Play External" })).not.toBeInTheDocument();
});

function Controls() { useRemoteNavigation(); return <><button>First</button><button>Second</button><input aria-label="Search" /></>; }
it("moves remote focus in the requested direction while leaving text editing alone", () => {
  const scroll = vi.fn();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const x = this.textContent === "Second" ? 100 : this.tagName === "INPUT" ? 200 : 0;
    return { x, y: 0, left: x, top: 0, right: x + 44, bottom: 44, width: 44, height: 44, toJSON() {} };
  });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scroll });
  render(<Controls />);
  screen.getByText("First").focus();
  fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
  expect(screen.getByText("Second")).toHaveFocus();
  expect(scroll).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
  screen.getByLabelText("Search").focus();
  fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
  expect(screen.getByLabelText("Search")).toHaveFocus();
});

it("exposes poster actions on keyboard focus and keeps rating changes out of navigation", () => {
  const details = vi.fn();
  const rate = vi.fn();
  render(<PosterCard posterUrl="" title="Fixture" details={{}} onClick={details} showRating onRatingChange={rate} />);
  const card = screen.getByRole("button", { name: "Fixture" });
  fireEvent.focus(card);
  expect(screen.queryByRole("button", { name: /Play/ })).not.toBeInTheDocument();
  const rating = screen.getByRole("combobox", { name: "Rate Fixture" });
  fireEvent.click(rating);
  fireEvent.change(rating, { target: { value: "7" } });
  expect(rate).toHaveBeenCalledWith(7);
  expect(details).not.toHaveBeenCalled();
});
