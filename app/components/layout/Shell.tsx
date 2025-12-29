import type { ReactNode } from "react";

interface ShellProps {
  children: ReactNode;
}

/**
 * Shell component
 *
 * Full viewport wrapper that provides the foundational layout structure.
 * Applies dark background and handles future header/navigation placement.
 */
export function Shell({ children }: ShellProps) {
  return (
    <div className="min-h-screen bg-background-primary text-foreground-primary">
      {/* Future slot for header/navigation */}
      {children}
    </div>
  );
}
