import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RequestModal } from "~/components/media/RequestModal";
const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); for (const [name, descriptor] of [["showModal", originalShow], ["close", originalClose]] as const) { if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor); else Reflect.deleteProperty(HTMLDialogElement.prototype, name); } });
it("shows partial and 4K season state, requests the remainder, and refreshes the result", async () => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: () => {} });
  const upstream = vi.fn(async (_url, init) => Response.json(init?.method === "POST" ? {
    ok: true, status: "processing", status4k: "unknown", seasons: [{ number: 1, status: "available", status4k: "unknown" }, { number: 2, status: "processing", status4k: "unknown" }],
  } : { status: "partially_available", status4k: "unknown", seasons: [{ number: 1, status: "available", status4k: "unknown" }, { number: 2, status: "unknown", status4k: "unknown" }] }));
  vi.stubGlobal("fetch", upstream);
  await act(async () => { render(<RequestModal item={{ tmdbId: 42, type: "show", title: "Fixture", tmdbUrl: "https://www.themoviedb.org/tv/42" }} onClose={() => {}} />); });
  expect(screen.getByText("Season 1: Available")).toBeInTheDocument();
  expect(screen.getByText("Season 2: Not requested")).toBeInTheDocument();
  expect(screen.getByText("4K: Not requested")).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Request missing seasons" })); });
  expect(JSON.parse(upstream.mock.calls[1][1].body)).toEqual({ type: "tv", tmdbId: 42 });
  expect(screen.getByText("Season 2: Requested")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Request missing seasons" })).not.toBeInTheDocument();
});
