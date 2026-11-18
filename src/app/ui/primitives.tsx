import type { ReactNode } from "react";

export function Card({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return <section id={id} className={`panel ${className ?? ""}`}>{children}</section>;
}

export function PageHeading({ title, description, actions }: {
  title: string; description?: ReactNode; actions?: ReactNode;
}) {
  return (
    <div className="workspace-heading">
      <div className="min-w-0">
        <h1 className="display-heading text-3xl text-brand sm:text-5xl">{title}</h1>
        {description && <div className="mt-3 max-w-prose text-sm leading-relaxed text-muted sm:text-base">{description}</div>}
      </div>
      {actions}
    </div>
  );
}

export function StatusPill({ children, tone }: { children: ReactNode; tone?: "positive" | "attention" | "danger" }) {
  return <span className="status-pill" data-tone={tone}>{children}</span>;
}

export function Notice({ children, error = false, className }: { children: ReactNode; error?: boolean; className?: string }) {
  return <p className={`notice ${className ?? ""}`} role={error ? "alert" : "status"}>{children}</p>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="empty-state">{children}</p>;
}

export function FieldLabel({ children, label, id }: { children: ReactNode; label: string; id?: string }) {
  return <label htmlFor={id} className="block min-w-0 text-sm font-semibold">{label}{children}</label>;
}

export function Confirmation({ name, children }: { name: string; children: ReactNode }) {
  return (
    <label className="confirmation">
      <input type="checkbox" name={name} required className="mt-0.5 size-5 shrink-0 accent-brand" />
      <span>{children}</span>
    </label>
  );
}

export function ArchArt({ className }: { className?: string }) {
  return <div aria-hidden="true" className={`arch-art ${className ?? ""}`}><div className="arch-art__opening" /></div>;
}
