import { useEffect, useRef, useState } from 'react';
import { Button, type ButtonProps } from '../ui';

/**
 * Oyun içi eylem butonu: tıklanınca kısa süre kendini kilitler (yanlışlıkla çift dokunuş
 * iki puan yazmasın) ve destekleyen cihazlarda hafif titreşim verir.
 */
export function ActionButton({ cooldownMs = 350, onClick, disabled, ...rest }: ButtonProps & { cooldownMs?: number }) {
  const [cooling, setCooling] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  return (
    <Button
      {...rest}
      disabled={disabled || cooling}
      onClick={(e) => {
        navigator.vibrate?.(15);
        setCooling(true);
        timer.current = setTimeout(() => setCooling(false), cooldownMs);
        onClick?.(e);
      }}
    />
  );
}
