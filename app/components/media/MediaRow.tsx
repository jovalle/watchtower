import { useId, useRef, useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Typography } from "~/components/ui";

interface MediaRowPropsWithChildren {
  title: string;
  children: ReactNode;
  items?: never;
  renderItem?: never;
  getKey?: never;
}
interface MediaRowPropsWithItems<T> {
  title: string;
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  getKey: (item: T) => string;
  children?: never;
}
type MediaRowProps<T> = MediaRowPropsWithChildren | MediaRowPropsWithItems<T>;

export function MediaRow<T>(props: MediaRowProps<T>) {
  const id = useId();
  const row = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({left: false, right: false});
  useEffect(() => {
    const element = row.current;
    if (!element) return;
    const update = () => setEdges({left: element.scrollLeft > 1, right: element.scrollLeft + element.clientWidth < element.scrollWidth - 1});
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element);
    element.addEventListener("scroll", update, { passive: true });
    return () => { observer?.disconnect(); element.removeEventListener("scroll", update); };
  }, [props.items, props.children]);
  if (props.items?.length === 0) return null;
  const scroll = (direction: number) => row.current?.scrollBy({ left: direction * row.current.clientWidth * 0.8, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  return <section aria-labelledby={id} className="relative py-4">
    <div className="mb-2 flex items-center justify-between gap-4">
      <div id={id} className="min-w-0"><Typography variant="title">{props.title}</Typography></div>
      <div className="flex shrink-0 gap-2">
        <button disabled={!edges.left} onClick={() => scroll(-1)} aria-label={`Scroll ${props.title} left`} className="flex h-11 w-11 items-center justify-center rounded-full bg-background-elevated disabled:opacity-40"><ChevronLeft className="h-5 w-5" /></button>
        <button disabled={!edges.right} onClick={() => scroll(1)} aria-label={`Scroll ${props.title} right`} className="flex h-11 w-11 items-center justify-center rounded-full bg-background-elevated disabled:opacity-40"><ChevronRight className="h-5 w-5" /></button>
      </div>
    </div>
    <div ref={row} className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 py-5 scrollbar-hide sm:-mx-5 sm:px-5 md:gap-6">
      {props.items ? props.items.map((item, index) => <div className="shrink-0 snap-start" key={props.getKey(item)}>{props.renderItem(item, index)}</div>) : props.children}
    </div>
  </section>;
}
