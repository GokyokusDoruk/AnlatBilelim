import { describe, expect, it } from 'vitest';
import { ALL_MODES, advance, canPass, passCost, passesLeft, stepKind } from './board';
import type { TabuCard, TripleCard } from './types';

const tabu: TabuCard = { kind: 'tabu', word: 'x', forbidden: ['a', 'b', 'c', 'd', 'e', 'f'], hit: [false, false, false, false, false, false] };
const triple = (solved: [boolean, boolean, boolean]): TripleCard => ({ kind: 'triple', words: ['a', 'b', 'c'], solved });

describe('tahta kuralları', () => {
  it('sabit modlu basamaklar ve geri kalan karışık', () => {
    const fixed: Record<string, number[]> = { cizme: [7, 8, 10, 13, 15, 16, 20, 21, 25, 32, 33, 38], anlatma: [1, 2, 3, 4, 6, 11, 12, 14, 17, 22, 27, 28, 30, 34, 35, 40], onbes: [5, 9, 18, 19, 24, 36, 37, 42] };
    const all = new Set<number>();
    for (const [mode, steps] of Object.entries(fixed)) for (const st of steps) { expect(stepKind(st)).toBe(mode); all.add(st); }
    for (let i = 1; i <= 45; i++) if (!all.has(i)) expect(stepKind(i)).toBe('karisik');
  });

  it('kukla artık ne tahtada ne çarkta', () => {
    for (let i = 1; i <= 45; i++) expect(stepKind(i)).not.toBe('kukla');
    expect(ALL_MODES).toEqual(['anlatma', 'cizme', 'onbes']);
  });

  it('negatif skor geri götürmez, 45 üstü 45e kırpılır', () => {
    expect(advance(10, -3)).toBe(10);
    expect(advance(40, 9)).toBe(45);
  });

  it('pass maliyeti: anlatmada 1, üçlü kartta bilinmemiş kelime sayısı', () => {
    expect(passCost(tabu)).toBe(1);
    expect(passCost(triple([false, false, false]))).toBe(3);
    expect(passCost(triple([true, false, false]))).toBe(2);
  });

  it('kalan hak maliyetten azsa pass kapalı', () => {
    expect(passesLeft('cizme', 1)).toBe(2);
    expect(canPass('cizme', 1, triple([false, false, false]))).toBe(false);
    expect(canPass('cizme', 1, triple([true, false, false]))).toBe(true);
    expect(canPass('anlatma', 2, tabu)).toBe(true);
    expect(canPass('anlatma', 3, tabu)).toBe(false);
    expect(canPass('anlatma', 0, null)).toBe(false);
  });
});
