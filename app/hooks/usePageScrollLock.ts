import { useEffect } from "react";

let locks = 0;
let unlock: (() => void) | undefined;

/** Freeze the page without removing its scrollbar gutter; nested overlays share the lock. */
export function usePageScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (locks++ === 0) {
      const body = document.body;
      const { scrollX, scrollY } = window;
      const previous = { position: body.style.position, top: body.style.top, left: body.style.left, right: body.style.right };
      Object.assign(body.style, { position: "fixed", top: `${-scrollY}px`, left: "0", right: "0" });
      unlock = () => {
        Object.assign(body.style, previous);
        window.scrollTo({ left: scrollX, top: scrollY, behavior: "instant" });
      };
    }
    return () => {
      if (--locks === 0) {
        unlock?.();
        unlock = undefined;
      }
    };
  }, [active]);
}
