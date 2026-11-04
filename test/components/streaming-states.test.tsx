import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StreamingDashboard } from "~/components/StreamingDashboard";

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("keeps a failed history request visible until the user retries", async () => {
  vi.useFakeTimers();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  let historyRequests = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    if (input.includes("history")) {
      historyRequests++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response("Unavailable", { status: 503 });
    }
    return new Response(JSON.stringify({ sessions: [] }));
  }));
  render(<StreamingDashboard isOpen onOpenChange={() => {}} triggerClassName="flex" />);
  fireEvent.click(screen.getByRole("button", { name: "Recent" }));
  await act(async () => { await vi.advanceTimersByTimeAsync(100); });
  expect(screen.getByRole("alert")).toHaveTextContent("Failed to fetch history: 503");
  expect(historyRequests).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
  await act(async () => { await vi.advanceTimersByTimeAsync(20); });
  expect(historyRequests).toBe(2);
});
