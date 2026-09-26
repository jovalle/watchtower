import { NavLink, Outlet } from "@remix-run/react";
import { Container } from "~/components/layout";

export default function MyStuff() {
  return <>
    <Container size="wide" className="pt-8">
      <h1 className="text-3xl font-bold">My Stuff</h1>
      <nav aria-label="My Stuff sections" className="mt-6 flex gap-6 border-b border-border-subtle">
        {[["Watchlist", "/app/stuff/watchlist"], ["Lists", "/app/stuff/lists"]].map(([label, to]) => <NavLink key={to} to={to} className={({ isActive }) => `min-h-11 border-b-2 px-1 py-3 text-sm font-medium ${isActive ? "border-accent-primary text-accent-primary" : "border-transparent text-foreground-secondary"}`}>{label}</NavLink>)}
      </nav>
    </Container>
    <Outlet />
  </>;
}
