import { useEffect, useRef } from 'react';

/**
 * Bileşen yaşadığı sürece çalışan rAF döngüsü. Callback ref'te tutulur,
 * böylece her render'da döngü yeniden kurulmaz. Sekme gizlenince tarayıcı
 * rAF'ı zaten durdurur; `active=false` ile döngü tamamen kapatılabilir.
 */
export function useAnimationFrame(callback: (dtMs: number, now: number) => void, active = true): void {
  const cb = useRef(callback);
  cb.current = callback;

  useEffect(() => {
    if (!active) return;
    let id = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(100, now - last); // sekme dönüşünde dev sıçramaları engelle
      last = now;
      cb.current(dt, now);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [active]);
}
