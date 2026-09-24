import { useEffect } from "react";
import { X } from "lucide-react";

interface TrailerModalProps {
  youtubeKey: string;
  title: string;
  onClose: () => void;
}

export function TrailerModal({ youtubeKey, title, onClose }: TrailerModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4" role="dialog" aria-modal="true" aria-label={`${title} trailer`}>
      <button className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Close trailer" />
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
            src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeKey)}?autoplay=1&rel=0`}
            title={`${title} trailer`}
            className="h-full w-full"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}
