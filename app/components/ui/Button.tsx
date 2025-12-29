import { type ButtonHTMLAttributes, type ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "secondary-light" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  // Accent color background, dark text for contrast
  primary: [
    "bg-accent-primary text-accent-foreground",
    "hover:bg-accent-hover hover:scale-[1.02]",
    "focus:ring-accent-primary focus:ring-2 focus:ring-offset-2 focus:ring-offset-background-primary focus:outline-none",
    "active:scale-[0.98]",
  ].join(" "),
  // Transparent with white border, white text
  secondary: [
    "bg-transparent text-white border border-white",
    "hover:bg-white/10 hover:scale-[1.02]",
    "focus:ring-white focus:ring-2 focus:ring-offset-2 focus:ring-offset-background-primary focus:outline-none",
    "active:scale-[0.98]",
  ].join(" "),
  // Light gray/white background, dark text - for use on dark backgrounds
  "secondary-light": [
    "bg-white/80 text-black/90",
    "hover:bg-white hover:scale-[1.02]",
    "focus:ring-white focus:ring-2 focus:ring-offset-2 focus:ring-offset-background-primary focus:outline-none",
    "active:scale-[0.98]",
  ].join(" "),
  // Transparent, white text, no border (for icon buttons)
  ghost: [
    "bg-transparent text-white",
    "hover:bg-white/10 hover:scale-[1.02]",
    "focus:ring-white/50 focus:ring-2 focus:ring-offset-2 focus:ring-offset-background-primary focus:outline-none",
    "active:scale-[0.98]",
  ].join(" "),
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-base",
  lg: "px-6 py-3 text-lg",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonProps) {
  const baseStyles =
    "inline-flex items-center justify-center align-middle font-medium rounded-md origin-center will-change-transform transition-[transform,background-color,box-shadow] duration-200";
  const variantClasses = variantStyles[variant];
  const sizeClasses = sizeStyles[size];

  return (
    <button
      className={`${baseStyles} ${variantClasses} ${sizeClasses}${className ? ` ${className}` : ""}`}
      {...props}
    >
      {children}
    </button>
  );
}
