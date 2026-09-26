import { NavLink } from "@remix-run/react";
import { Container } from "~/components/layout";

export default function WatchNavigation() {
  return (
    <Container size="wide" className="pt-8">
      <h1 className="text-3xl font-bold">Watch</h1>
      <nav
        aria-label="Watch sections"
        className="mt-6 flex gap-6 border-b border-border-subtle"
      >
        {[
          ["Movies", "/app/watch/movies"],
          ["Series", "/app/watch/series"],
          ["New in library", "/app/watch/recent"],
        ].map(([label, to]) => (
          <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) =>
              `border-b-2 px-1 py-3 text-sm font-medium ${
                isActive
                  ? "border-accent-primary text-accent-primary"
                  : "border-transparent text-foreground-secondary hover:text-foreground-primary"
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </Container>
  );
}
