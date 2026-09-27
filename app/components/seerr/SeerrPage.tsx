import { Form, Link, useNavigation, useSearchParams } from "@remix-run/react";
import type { ReactNode } from "react";
import { Container } from "~/components/layout";

export const controlClass =
  "min-h-11 rounded-md border border-border-emphasis bg-background-secondary px-4 py-2 text-sm text-foreground-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary disabled:opacity-50";
export const actionClass = `${controlClass} bg-accent-primary text-accent-foreground font-medium`;

export function SeerrError({ error }: { error: string }) {
  return (
    <div
      role="alert"
      className="my-6 rounded-lg border border-border-emphasis p-5"
    >
      <p>{error}</p>
      <div className="mt-4 flex gap-4">
        <Link reloadDocument to="" className="text-accent-primary">
          Try again
        </Link>
        <Link to="/app/settings" className="text-accent-primary">
          Settings
        </Link>
      </div>
    </div>
  );
}

export function SeerrPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const navigation = useNavigation();
  return (
    <Container size="wide" className="pb-16 pt-8">
      <div aria-busy={navigation.state !== "idle"}>
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="mb-8 mt-2 text-foreground-secondary">{description}</p>
        {children}
      </div>
    </Container>
  );
}

export function ListFilter({
  value,
  options,
}: {
  value: string;
  options: string[];
}) {
  return (
    <Form method="get" className="mb-6 flex flex-wrap items-center gap-3">
      <label htmlFor="status-filter" className="text-sm">
        Status
      </label>
      <select
        id="status-filter"
        name="filter"
        defaultValue={value}
        key={value}
        className={controlClass}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option[0].toUpperCase() + option.slice(1)}
          </option>
        ))}
      </select>
      <button className={controlClass}>Apply</button>
    </Form>
  );
}

export function Pagination({ page, pages }: { page: number; pages: number }) {
  const [params] = useSearchParams();
  const href = (next: number) => {
    const query = new URLSearchParams(params);
    query.set("page", String(next));
    return `?${query}`;
  };
  if (pages < 2 && page === 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center gap-4">
      {page > 1 && (
        <Link to={href(page - 1)} className={controlClass}>
          Previous
        </Link>
      )}
      <span className="text-sm text-foreground-secondary">
        Page {page}
        {pages > 0 ? ` of ${pages}` : ""}
      </span>
      {page < pages && (
        <Link to={href(page + 1)} className={controlClass}>
          Next
        </Link>
      )}
    </nav>
  );
}
