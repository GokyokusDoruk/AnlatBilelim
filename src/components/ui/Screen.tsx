import type { ReactNode } from 'react';
import { cx } from './cx';

export function Screen({ children, center, header }: { children: ReactNode; center?: boolean; header?: ReactNode }) {
  return (
    <main className={cx('screen', center && 'screen--center')}>
      {header ? <header className="screen__header">{header}</header> : null}
      {children}
    </main>
  );
}

export function Spinner({ label = 'Yükleniyor' }: { label?: string }) {
  return <div className="spinner" role="status" aria-label={label} />;
}
