import { useEffect, useState } from 'react';
import { serverNow } from '../net/connection';

/**
 * Sunucu saatine göre kalan tam saniye. Saniye sınırlarına hizalı tek bir
 * setTimeout zinciri kullanır (rAF değil): bileşen saniyede yalnızca 1 kez
 * render olur ve unmount'ta zamanlayıcı temizlenir.
 */
export function useServerCountdown(endsAt: number | null): number | null {
  const compute = () => (endsAt === null ? null : Math.max(0, Math.ceil((endsAt - serverNow()) / 1000)));
  const [left, setLeft] = useState(compute);

  useEffect(() => {
    if (endsAt === null) {
      setLeft(null);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      const remainingMs = endsAt - serverNow();
      setLeft(Math.max(0, Math.ceil(remainingMs / 1000)));
      if (remainingMs <= 0) return;
      const msToNextSecond = remainingMs % 1000 || 1000;
      timer = setTimeout(tick, msToNextSecond + 5);
    };
    tick();
    return () => {
      if (timer !== null) clearTimeout(timer);
    };
  }, [endsAt]);

  return left;
}
