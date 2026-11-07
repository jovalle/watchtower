import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InstallPrompt } from "~/components/pwa/InstallPrompt";

beforeEach(() => { vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), setItem: vi.fn() }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("dismisses the install banner after a declined native install prompt", async () => {
  render(<InstallPrompt />);
  const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt: vi.fn(async () => {}),
    userChoice: Promise.resolve({ outcome: "dismissed" }),
  });
  act(() => { window.dispatchEvent(event); });
  fireEvent.click(screen.getByRole("button", { name: "Install" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Install" })).toBeNull());
  expect(event.prompt).toHaveBeenCalledOnce();
});
