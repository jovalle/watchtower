import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { usePageScrollLock } from "~/hooks/usePageScrollLock";
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.removeAttribute("style"); });
function Overlay({ active }: { active: boolean }) { usePageScrollLock(active); return null; }
it("freezes the page until the last overlay closes and restores styles and scroll position", () => {
  document.body.style.position = "relative";
  document.body.style.top = "2px";
  vi.stubGlobal("scrollY", 180);
  vi.stubGlobal("scrollX", 0);
  const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const { rerender } = render(<><Overlay active /><Overlay active /></>);
  expect(document.body.style.position).toBe("fixed");
  expect(document.body.style.top).toBe("-180px");
  rerender(<><Overlay active={false} /><Overlay active /></>);
  expect(document.body.style.position).toBe("fixed");
  expect(scroll).not.toHaveBeenCalled();
  rerender(<><Overlay active={false} /><Overlay active={false} /></>);
  expect(document.body.style.position).toBe("relative");
  expect(document.body.style.top).toBe("2px");
  expect(scroll).toHaveBeenCalledWith({ left: 0, top: 180, behavior: "instant" });
});
