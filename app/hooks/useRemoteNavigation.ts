import { useEffect } from "react";

/** Directional remotes follow visible controls; text editing and sliders retain native keys. */
export function useRemoteNavigation() {
  useEffect(() => {
    const move = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      const current = document.activeElement as HTMLElement | null;
      if (!current || current.matches("input, textarea, select, video, [role=slider]") || current.isContentEditable) return;
      const scope = document.querySelector("dialog[open]") ?? document;
      const controls = [...scope.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')].filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && !element.closest("[hidden], [inert]") && getComputedStyle(element).visibility !== "hidden";
      });
      const from = current.getBoundingClientRect();
      const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
      const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
      const ranked = controls.filter((element) => element !== current && !element.contains(current) && !current.contains(element)).map((element) => {
        const rect = element.getBoundingClientRect();
        const dx = rect.x + rect.width / 2 - from.x - from.width / 2;
        const dy = rect.y + rect.height / 2 - from.y - from.height / 2;
        return { element, forward: (horizontal ? dx : dy) * direction, cross: Math.abs(horizontal ? dy : dx) };
      }).filter((candidate) => candidate.forward > 1).sort((a, b) => (a.forward + a.cross * 3) - (b.forward + b.cross * 3));
      const target = current === document.body ? controls[0] : ranked[0]?.element;
      if (!target) return;
      event.preventDefault();
      target.focus();
      target.scrollIntoView({ block: "nearest", inline: "nearest" });
    };
    document.addEventListener("keydown", move);
    return () => document.removeEventListener("keydown", move);
  }, []);
}
