import { useEffect, useRef, useState } from 'react';

/**
 * Tam sayı bir değere basamak basamak yürür (tahtada piyon adım adım ilerlesin diye).
 * Toplam süre `maxTotalMs` ile sınırlıdır; tek bir setTimeout zinciri kullanır ve
 * unmount / hedef değişiminde temizlenir. İlk değer animasyonsuz gösterilir.
 */
export function useSteppedValue(target: number, stepMs = 160, maxTotalMs = 1400): number {
  const [value, setValue] = useState(target);
  const current = useRef(target);

  useEffect(() => {
    if (current.current === target) return;
    const direction = target > current.current ? 1 : -1;
    const steps = Math.abs(target - current.current);
    const delay = Math.min(stepMs, maxTotalMs / steps);
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      current.current += direction;
      setValue(current.current);
      if (current.current !== target) timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, delay);
    return () => {
      if (timer !== null) clearTimeout(timer);
    };
  }, [target, stepMs, maxTotalMs]);

  return value;
}
