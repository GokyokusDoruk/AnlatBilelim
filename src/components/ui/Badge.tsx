import type { ReactNode } from 'react';
import { cx } from './cx';

export type BadgeTone = 'default' | 'team-a' | 'team-b' | 'success' | 'warning' | 'danger';

export function Badge({ tone = 'default', dot, children }: { tone?: BadgeTone; dot?: boolean; children: ReactNode }) {
  return (
    <span className={cx('badge', tone !== 'default' && `badge--${tone}`)}>
      {dot ? <span className="badge__dot" aria-hidden /> : null}
      {children}
    </span>
  );
}
