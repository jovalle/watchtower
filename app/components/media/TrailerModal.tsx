import { useEffect, useRef } from "react";
import { X } from "lucide-react";

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
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      className="fixed inset-0 z-[60] m-0 hidden h-dvh max-h-none w-screen max-w-none items-center justify-center border-0 bg-black/90 p-4 open:flex"
      aria-label={`${title} trailer`}
    >
      <button
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        aria-label="Close trailer"
      />
      <div className="relative w-full max-w-5xl">
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 rounded-full p-1 text-white/80 transition-colors hover:text-white"
          aria-label="Close trailer"
        >
          <X className="h-7 w-7" />
        </button>
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
