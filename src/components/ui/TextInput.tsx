import { useId, type InputHTMLAttributes } from 'react';
import { cx } from './cx';

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  variant?: 'default' | 'code';
}

export function TextInput({ label, variant = 'default', className, id, ...rest }: TextInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="field">
      <label className="field__label" htmlFor={inputId}>
        {label}
      </label>
      <input id={inputId} className={cx('input', variant === 'code' && 'input--code', className)} {...rest} />
    </div>
  );
}
