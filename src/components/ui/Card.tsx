import type { HTMLAttributes, ReactNode } from 'react';
import type { TeamId } from '@shared/types';
import { cx } from './cx';

interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  team?: TeamId | null;
}

export function Card({ title, team, className, children, ...rest }: CardProps) {
  return (
    <section className={cx('card', team === 'A' && 'card--team-a', team === 'B' && 'card--team-b', className)} {...rest}>
      {title ? <h2 className="card__title">{title}</h2> : null}
      {children}
    </section>
  );
}
