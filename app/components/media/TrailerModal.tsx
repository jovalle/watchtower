import { useEffect, useRef } from "react";
import { Button } from "~/components/ui";
import { X } from "lucide-react";
import { usePageScrollLock } from "~/hooks/usePageScrollLock";

interface TrailerModalProps {
  youtubeKey: string;
  title: string;
  onClose: () => void;
}

export function TrailerModal({
  youtubeKey,
  title,
  onClose,
}: TrailerModalProps) {
  usePageScrollLock(true);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="fixed inset-0 z-[60] m-0 hidden h-dvh max-h-none w-screen max-w-none items-center justify-center border-0 bg-black/90 p-4 open:flex"
      aria-label={`${title} trailer`}
    >
      <div className="relative w-full max-w-[min(64rem,calc((100dvh-7rem)*16/9))]">
        <Button variant="ghost" size="sm"
          onClick={onClose}
          className="absolute bottom-full right-0 mb-1"
          aria-label="Close Trailer"
        >
          <X className="h-6 w-6" />
        </Button>
        <div className="aspect-video w-full overflow-hidden rounded-lg bg-black shadow-2xl">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(
              youtubeKey
            )}?autoplay=1&rel=0`}
            title={`${title} trailer`}
            className="h-full w-full"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    </dialog>
  );
}
