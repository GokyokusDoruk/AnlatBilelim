import { memo, type ButtonHTMLAttributes } from 'react';
import { cx } from './cx';

export type ButtonVariant = 'default' | 'primary' | 'success' | 'danger' | 'team-a' | 'team-b' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
}

export const Button = memo(function Button({
  variant = 'default',
  size = 'md',
  block,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'btn',
        variant !== 'default' && `btn--${variant}`,
        size !== 'md' && `btn--${size}`,
        block && 'btn--block',
        className,
      )}
      {...rest}
    />
  );
});
