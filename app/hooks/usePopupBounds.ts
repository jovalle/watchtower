import { useEffect, useRef } from "react";

/** Keep an anchored popup inside the visible viewport when its trigger is near an edge. */
export function usePopupBounds(open: boolean, placement?: "menu") {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const panel = ref.current;
    if (!open || !panel) return;
    function fit() {
      if (!panel) return;
      if (placement === "menu" && panel.parentElement) {
        const anchor = panel.parentElement.getBoundingClientRect();
        const headerBottom = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
        const above = anchor.top - Math.max(0, headerBottom) - 12;
        const below = window.innerHeight - anchor.bottom - 12;
        const openAbove = below < 320 && above > below;
        panel.style.top = openAbove ? "auto" : "100%";
        panel.style.bottom = openAbove ? "100%" : "auto";
        panel.style.marginBlock = openAbove ? "0 4px" : "4px 0";
        panel.style.maxHeight = `${Math.max(0, Math.min(400, openAbove ? above : below))}px`;
      }
      panel.style.marginLeft = "";
      const bounds = panel.getBoundingClientRect();
      const left = Math.max(8, Math.min(bounds.left, document.documentElement.clientWidth - bounds.width - 8));
      panel.style.marginLeft = `${left - bounds.left}px`;
    }
    fit();
    window.addEventListener("resize", fit);
    if (placement === "menu") window.addEventListener("scroll", fit, { passive: true });
    return () => { window.removeEventListener("resize", fit); window.removeEventListener("scroll", fit); };
  }, [open, placement]);
  return ref;
}
