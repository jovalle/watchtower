import type { ReactNode } from "react";

export function PageHeader({ title, description, actions, navigation }: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  navigation?: ReactNode;
}) {
  return (
    <div className={navigation ? "" : "mb-8"}>
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-4">
        <h1 className="flex min-h-11 min-w-0 max-w-full items-center [overflow-wrap:anywhere] text-3xl font-bold leading-9">{title}</h1>
        {actions && <div className="flex max-w-full flex-wrap items-center gap-3">{actions}</div>}
      </div>
      {description && <p className="mt-2 break-words text-foreground-secondary">{description}</p>}
      {navigation && <div className="mt-6">{navigation}</div>}
    </div>
  );
}
