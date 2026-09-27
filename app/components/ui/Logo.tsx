// Stylesheet background, not <img> or inline style: hover-zoom extensions only read those.
export function Logo({ className = "h-7" }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Watchtower"
      className={`block aspect-[376/86] bg-[url('/logo.png')] bg-contain bg-center bg-no-repeat ${className}`}
    />
  );
}
