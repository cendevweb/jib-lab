import type { ReactNode } from "react";

export interface DemoShellProps {
  title: string;
  /** The social-post hook, shown under the title. */
  hook?: string;
  /** Small badge, e.g. "Jev · simulated". */
  badge?: string;
  footer?: ReactNode;
  children: ReactNode;
}

/** Page frame shared by every jib-lab demo: header (title/hook/badge), main, footer. */
export function DemoShell({ title, hook, badge, footer, children }: DemoShellProps) {
  return (
    <div className="jib-shell">
      <header className="jib-shell__header">
        <h1 className="jib-shell__title">{title}</h1>
        {hook ? <p className="jib-shell__hook">{hook}</p> : null}
        {badge ? (
          <span className="jib-shell__badge" data-testid="provider-badge">
            {badge}
          </span>
        ) : null}
      </header>
      <main className="jib-shell__main">{children}</main>
      {footer ? <footer className="jib-shell__footer">{footer}</footer> : null}
    </div>
  );
}

export function Panel({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`jib-panel${className ? ` ${className}` : ""}`} aria-label={title}>
      {title ? <h2 className="jib-panel__title">{title}</h2> : null}
      {children}
    </section>
  );
}
