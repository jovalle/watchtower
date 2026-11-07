import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TrailerModal } from "~/components/media/TrailerModal";

it("opens the trailer as a native modal and closes on cancel", () => {
  const restoreScroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const trigger = document.createElement("button");
  document.body.append(trigger);
  trigger.focus();
  const showModal = vi.fn(function (this: HTMLDialogElement) { this.open = true; this.querySelector("button")?.focus(); });
  const close = vi.fn();
  HTMLDialogElement.prototype.showModal = showModal;
  HTMLDialogElement.prototype.close = close;
  const onClose = vi.fn();
  const { unmount } = render(<TrailerModal youtubeKey="key" title="Example" onClose={onClose} />);
  expect(showModal).toHaveBeenCalled();
  fireEvent(screen.getByRole("dialog", { hidden: true }), new Event("cancel", { bubbles: true, cancelable: true }));
  expect(onClose).toHaveBeenCalled();
  unmount();
  expect(close).toHaveBeenCalled();
  expect(trigger).toHaveFocus();
  trigger.remove();
  expect(restoreScroll).toHaveBeenCalledWith({ left: 0, top: 0, behavior: "instant" });
  restoreScroll.mockRestore();
});
