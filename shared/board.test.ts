import { describe, expect, it } from 'vitest';
import { advance, canPass, passCost, passesLeft, stepKind } from './board';
import type { TabuCard, TripleCard } from './types';

const tabu: TabuCard = { kind: 'tabu', word: 'x', forbidden: ['a', 'b', 'c', 'd', 'e'] };
const triple = (solved: [boolean, boolean, boolean]): TripleCard => ({ kind: 'triple', words: ['a', 'b', 'c'], solved });

describe('tahta kuralları', () => {
  it('basamak aralıkları mod renk kodlarına uyar', () => {
    const at = (a: number, b: number, k: string) => { for (let i = a; i <= b; i++) expect(stepKind(i)).toBe(k); };
    at(1, 10, 'anlatma'); at(11, 15, 'cizme'); at(16, 20, 'kukla'); at(21, 25, 'anlatma'); at(26, 30, 'onbes'); at(31, 45, 'karisik');
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
