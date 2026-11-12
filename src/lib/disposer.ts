/**
 * Temizlik fonksiyonlarını tek yerde toplayan küçük yardımcı.
 * Three.js sahneleri, canvas, rAF döngüleri, zamanlayıcılar ve olay dinleyicileri
 * oluşturuldukları anda buraya kaydedilir; unmount'ta `dispose()` hepsini ters
 * sırada çalıştırır. Böylece "temizlemeyi unuttum" kaynaklı sızıntılar engellenir.
 */
export type Cleanup = () => void;

export interface Disposer {
  add(cleanup: Cleanup): void;
  /** addEventListener + otomatik removeEventListener. */
  listen<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    handler: (ev: WindowEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void;
  listen(target: EventTarget, type: string, handler: EventListener, options?: AddEventListenerOptions): void;
  timeout(fn: () => void, ms: number): void;
  interval(fn: () => void, ms: number): void;
  readonly disposed: boolean;
  dispose(): void;
}

/**
 * Yalnızca geliştirme: açık (dispose edilmemiş) disposer sayısı `window.__tabuLive` üzerinden okunur.
 * Bellek sızıntısı testi (scripts/leak-test.mjs) sahne geçişlerinden sonra bunun 0'a döndüğünü doğrular.
 */
function trackLive(delta: number): void {
  if (!import.meta.env.DEV) return;
  const w = window as unknown as { __tabuLive?: number };
  w.__tabuLive = (w.__tabuLive ?? 0) + delta;
}

export function createDisposer(): Disposer {
  const stack: Cleanup[] = [];
  let disposed = false;
  trackLive(1);

  const add = (cleanup: Cleanup) => {
    if (disposed) {
      cleanup(); // geç kayıt: hemen temizle
      return;
    }
    stack.push(cleanup);
  };

  return {
    add,
    listen(target: EventTarget, type: string, handler: EventListener, options?: AddEventListenerOptions) {
      target.addEventListener(type, handler, options);
      add(() => target.removeEventListener(type, handler, options));
    },
    timeout(fn, ms) {
      const id = setTimeout(fn, ms);
      add(() => clearTimeout(id));
    },
    interval(fn, ms) {
      const id = setInterval(fn, ms);
      add(() => clearInterval(id));
    },
    get disposed() {
      return disposed;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      trackLive(-1);
      while (stack.length) {
        try {
          stack.pop()!();
        } catch (err) {
          console.error('[disposer]', err);
        }
      }
    },
  } as Disposer;
}
