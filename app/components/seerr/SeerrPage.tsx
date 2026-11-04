import { Form, Link, useNavigation, useSearchParams } from "@remix-run/react";
import type { ReactNode } from "react";
import { Container, PageHeader } from "~/components/layout";
import { buttonStyles } from "~/components/ui/Button";

export const inputClass =
  "min-h-11 min-w-0 rounded-md border border-border-emphasis bg-background-elevated px-4 py-2 text-sm text-foreground-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary disabled:opacity-50";
export const controlClass = buttonStyles({ variant: "secondary", size: "sm" });
export const actionClass = buttonStyles({ size: "sm" });

export function SeerrError({ error }: { error: string }) {
  return (
    <div
      role="alert"
      className="my-6 rounded-lg border border-border-emphasis p-5"
    >
      <p className="break-words">{error}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link reloadDocument to="" className={controlClass}>
          Try Again
        </Link>
        <Link to="/app/settings" className={controlClass}>
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
        <PageHeader title={title} description={description} />
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
        className={inputClass}
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
    <nav aria-label="Pagination" className="mt-8 flex flex-wrap items-center gap-4">
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
