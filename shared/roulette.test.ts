import { describe, expect, it } from 'vitest';
import { ALL_MODES } from './board';
import { ROULETTE_SPIN_MS, modeAtPointer, rouletteAngle } from './roulette';

describe('mod çarkı', () => {
  it('her seed ve her sonuç için çark doğru dilimde durur', () => {
    for (const mode of ALL_MODES) {
      for (let seed = 0; seed < 2000; seed++) {
        const end = rouletteAngle(mode, seed, ROULETTE_SPIN_MS);
        expect(modeAtPointer(end)).toBe(mode);
      }
    }
  });

  it('süre dolduktan sonra açı değişmez, başlangıçta 0', () => {
    expect(rouletteAngle('kukla', 7, 0)).toBe(0);
    expect(rouletteAngle('kukla', 7, ROULETTE_SPIN_MS)).toBe(rouletteAngle('kukla', 7, ROULETTE_SPIN_MS * 3));
  });

  it('açı zamanla artar ve yavaşlar (easing)', () => {
    let prev = -1;
    let prevDelta = Infinity;
    for (let t = 0; t <= ROULETTE_SPIN_MS; t += 100) {
      const a = rouletteAngle('onbes', 3, t);
      expect(a).toBeGreaterThanOrEqual(prev);
      if (t > 0) {
        const delta = a - prev;
        expect(delta).toBeLessThanOrEqual(prevDelta + 1e-9);
        prevDelta = delta;
      }
      prev = a;
    }
  });

  it('aynı girdiler her cihazda aynı açıyı verir (deterministik)', () => {
    expect(rouletteAngle('cizme', 12345, 1234)).toBe(rouletteAngle('cizme', 12345, 1234));
  });

  it('farklı seed farklı son açı üretir', () => {
    const angles = new Set<number>();
    for (let s = 0; s < 20; s++) angles.add(rouletteAngle('anlatma', s, ROULETTE_SPIN_MS));
    expect(angles.size).toBeGreaterThan(10);
  });
});
