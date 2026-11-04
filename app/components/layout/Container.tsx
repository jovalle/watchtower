import type { ReactNode } from "react";

type ContainerSize = "default" | "wide" | "full";

interface ContainerProps {
  children: ReactNode;
  size?: ContainerSize;
  className?: string;
}

const sizeClasses: Record<ContainerSize, string> = {
  default: "max-w-7xl", // 1280px
  wide: "max-w-screen-2xl", // 1536px
  full: "max-w-none",
};

/**
 * Container component
 *
 * Responsive max-width container that centers content and applies
 * horizontal padding that adapts to screen size.
 */
export function Container({
  children,
  size = "default",
  className = "",
}: ContainerProps) {
  return (
    <div
      className={`page-gutter mx-auto w-full ${sizeClasses[size]} ${className}`}
    >
      {children}
    </div>
  );
}
