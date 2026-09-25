import { useEffect, useState } from "react";
import { CheckCircle } from "lucide-react";

type ToastItem = { id: number; message: string };

const listeners = new Set<(item: ToastItem) => void>();
let nextId = 0;

export function toast(message: string) {
  const item = { id: ++nextId, message };
  listeners.forEach((listener) => listener(item));
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const add = (item: ToastItem) => {
      setItems((list) => [...list, item]);
      setTimeout(
        () => setItems((list) => list.filter((t) => t.id !== item.id)),
        3000
      );
    };
    listeners.add(add);
    return () => {
      listeners.delete(add);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2"
    >
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-2 rounded-md border border-border-subtle bg-background-elevated px-4 py-2 text-sm text-foreground-primary shadow-lg"
        >
          <CheckCircle className="h-4 w-4 text-green-500" />
          {item.message}
        </div>
      ))}
    </div>
  );
}
