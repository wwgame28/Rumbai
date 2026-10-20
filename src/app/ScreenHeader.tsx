import type { ReactNode } from 'react';

export function ScreenHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="screen-header">
      <div className="grow">
        <h1>{title}</h1>
        {subtitle && <p className="screen-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}
