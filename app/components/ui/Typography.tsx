import { type ReactNode } from "react";

type TypographyVariant =
  | "hero"
  | "title"
  | "subtitle"
  | "body"
  | "caption"
  | "label";

type TypographyElement = "h1" | "h2" | "h3" | "h4" | "p" | "span";

interface TypographyProps {
  variant: TypographyVariant;
  as?: TypographyElement;
  className?: string;
  children: ReactNode;
}

const variantStyles: Record<TypographyVariant, string> = {
  // Large display text for hero/billboard titles
  hero: "text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground-primary",
  // Section and media titles
  title: "text-2xl md:text-3xl font-semibold text-foreground-primary",
  // Secondary titles, taglines
  subtitle: "text-xl font-medium text-foreground-secondary",
  // Standard body text
  body: "text-base font-normal text-foreground-primary",
  // Metadata, timestamps
  caption: "text-sm text-foreground-muted",
  // UI labels, buttons
  label: "text-sm font-medium uppercase tracking-wide text-foreground-secondary",
};

const defaultElements: Record<TypographyVariant, TypographyElement> = {
  hero: "h1",
  title: "h2",
  subtitle: "h3",
  body: "p",
  caption: "span",
  label: "span",
};

export function Typography({
  variant,
  as,
  className = "",
  children,
}: TypographyProps) {
  const Component = as ?? defaultElements[variant];
  const baseStyles = variantStyles[variant];

  return (
    <Component className={`${baseStyles}${className ? ` ${className}` : ""}`}>
      {children}
    </Component>
  );
}
