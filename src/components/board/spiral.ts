/**
 * Spiral tahta geometrisi (saf fonksiyonlar, test edilir). Başlangıç dış kenarda, 45. basamak
 * merkezdedir. Yol, içe doğru dönen bir Arşimet spiralinin üzerine eğlenceli dalgalanmalar
 * (kıvrımlar) eklenerek çizilir; basamaklar yol boyunca eşit aralıklı yerleştirilir.
 */
import { BOARD_SIZE } from './../../../shared/constants';

export const VIEW = 400;
const CENTER = VIEW / 2;
const R_OUT = 168;
const TURNS = 2.6;
/** Spiralin iç ucu: yıldız (son basamak) bunun da içinde, tam merkezde durur. */
const R_IN = 46;
const WOBBLE = 11;
const WOBBLE_FREQ = 4.5;

export interface Pt {
  readonly x: number;
  readonly y: number;
}

function raw(t: number): Pt {
  // t: 0 (dış) .. 1 (merkez)
  const theta = t * TURNS * Math.PI * 2 - Math.PI / 2;
  const base = R_OUT - (R_OUT - R_IN) * t;
  const taper = Math.min(1, (base - R_IN) / 30 + 0.3); // iç uçta kıvrım azalır
  const r = base + WOBBLE * taper * Math.sin(t * TURNS * Math.PI * 2 * WOBBLE_FREQ);
  return { x: CENTER + r * Math.cos(theta), y: CENTER + r * Math.sin(theta) };
}

export interface SpiralLayout {
  /** points[0] = başlangıç, points[n] = n. basamak (n = 1..BOARD_SIZE). */
  readonly points: readonly Pt[];
  /** Yolu çizmek için yoğun örnekler. */
  readonly path: string;
}

export function buildSpiral(size: number = BOARD_SIZE): SpiralLayout {
  const N = 1600;
  const dense: Pt[] = [];
  const cum: number[] = [0];
  for (let i = 0; i <= N; i++) {
    dense.push(raw(i / N));
    if (i > 0) cum.push(cum[i - 1]! + Math.hypot(dense[i]!.x - dense[i - 1]!.x, dense[i]!.y - dense[i - 1]!.y));
  }
  const total = cum[N]!;
  const points: Pt[] = [];
  let j = 0;
  for (let k = 0; k < size; k++) {
    const target = (total * k) / (size - 1);
    while (j < N && cum[j + 1]! < target) j++;
    const seg = cum[j + 1]! - cum[j]! || 1;
    const f = Math.min(1, Math.max(0, (target - cum[j]!) / seg));
    const a = dense[j]!;
    const b = dense[Math.min(N, j + 1)]!;
    points.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  }
  points.push({ x: CENTER, y: CENTER }); // son basamak: merkezdeki yıldız
  const path = dense
    .filter((_, i) => i % 8 === 0 || i === N)
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ') + ` L${CENTER} ${CENTER}`;
  return { points, path };
}

/** 5 köşeli yıldız noktaları (SVG polygon). */
export function starPoints(cx: number, cy: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}
