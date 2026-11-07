import { NavLink } from "@remix-run/react";

export function SectionNavigation({ label, items }: {
  label: string;
  items: { label: string; to: string }[];
}) {
  return (
    <nav aria-label={label} className="flex min-w-0 gap-6 overflow-x-auto border-b border-border-subtle">
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end className={({ isActive }) =>
          `inline-flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium ${isActive ? "border-accent-primary text-accent-primary" : "border-transparent text-foreground-secondary hover:text-foreground-primary"}`
        }>{item.label}</NavLink>
      ))}
    </nav>
  );
}
