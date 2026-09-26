import { useEffect, useRef, type RefObject } from "react";
import { useLocation } from "@remix-run/react";

const controls = 'a[href], button, input, select, textarea, [tabindex="0"]';
const identity = (element: HTMLElement) => JSON.stringify([
  element.tagName, element.getAttribute("href"), element.getAttribute("aria-label"),
  element.id || element.textContent?.trim(),
]);

/** Remember the focused browse control across detail/player routes, including deferred rows. */
export function useRouteFocus(main: RefObject<HTMLElement | null>) {
  const location = useLocation();
  const saved = useRef(new Map<string, { identity: string; index: number }>());
  const previousPath = useRef(location.pathname);
  useEffect(() => {
    const root = main.current;
    if (!root) return;
    const key = location.pathname + location.search;
    const remember = (event: FocusEvent) => {
      const element = event.target;
      if (!(element instanceof HTMLElement) || !element.matches(controls)) return;
      const signature = identity(element);
      const matches = [...root.querySelectorAll<HTMLElement>(controls)].filter((item) => identity(item) === signature);
      saved.current.set(key, { identity: signature, index: matches.indexOf(element) });
      // ponytail: retain the last 50 browse locations in this tab; no persisted UI history.
      if (saved.current.size > 50) saved.current.delete(saved.current.keys().next().value!);
    };
    const existingFocus = previousPath.current === location.pathname && root.contains(document.activeElement);
    previousPath.current = location.pathname;
    const target = saved.current.get(key);
    const restore = () => {
      if (!target) return false;
      const match = [...root.querySelectorAll<HTMLElement>(controls)].filter((item) => identity(item) === target.identity)[target.index];
      if (!match) return false;
      match.focus({ preventScroll: true });
      match.scrollIntoView({ block: "nearest", inline: "nearest" });
      return true;
    };
    let observer: MutationObserver | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const stop = () => { observer?.disconnect(); clearTimeout(deadline); };
    if (!existingFocus && !restore()) {
      const heading = root.querySelector<HTMLElement>("h1") ?? root;
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      if (target) {
        observer = new MutationObserver(() => { if (restore()) stop(); });
        observer.observe(root, { childList: true, subtree: true });
        deadline = setTimeout(stop, 10000);
      }
    }
    root.addEventListener("focusin", remember);
    document.addEventListener("keydown", stop, true);
    document.addEventListener("pointerdown", stop, true);
    return () => {
      stop();
      root.removeEventListener("focusin", remember);
      document.removeEventListener("keydown", stop, true);
      document.removeEventListener("pointerdown", stop, true);
    };
  }, [location.pathname, location.search, main]);
}
