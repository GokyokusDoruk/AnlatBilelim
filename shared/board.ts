import { BOARD_SIZE } from './constants';
import type { Card, GameMode, StepKind } from './types';

export interface ModeConfig {
  readonly mode: GameMode;
  readonly label: string;
  readonly durationSec: number;
  /** Tur boyunca toplam pass hakkı (kelime bazlı). */
  readonly passLimit: number;
  /** Bir kartta kaç hedef kelime var. */
  readonly wordsPerCard: number;
  /** Sadece 15 Kelime modunda: ipucu kelime limiti. */
  readonly clueLimit?: number;
}

export const MODE_CONFIG: Readonly<Record<GameMode, ModeConfig>> = {
  anlatma: { mode: 'anlatma', label: 'Anlatma', durationSec: 60, passLimit: 3, wordsPerCard: 1 },
  cizme: { mode: 'cizme', label: 'Çizme', durationSec: 90, passLimit: 3, wordsPerCard: 3 },
  kukla: { mode: 'kukla', label: 'Kukla', durationSec: 120, passLimit: 3, wordsPerCard: 3 },
  onbes: { mode: 'onbes', label: '15 Kelime', durationSec: 120, passLimit: 3, wordsPerCard: 3, clueLimit: 15 },
};

/**
 * Oyunda (tahta + karışık basamak çarkı) kullanılan modlar. Kukla tahtadan kaldırıldı;
 * yeri 15 Kelime, Çizme ve Anlatma'ya dağıtıldı. Kukla kodu ileride geri açılabilsin diye duruyor.
 */
export const ALL_MODES: readonly GameMode[] = ['anlatma', 'cizme', 'onbes'];

/**
 * Sabit modlu basamaklar. Listede olmayan her basamak "Karışık"tır (mod senkron çarkla seçilir).

 *  Çizme: 7, 8, 10, 13, 15, 16, 20, 21, 25, 32, 33, 38 · 15 Kelime: 5, 9, 18, 19, 24, 36, 37, 42
 *  Anlatma: 1-4, 6, 11, 12, 14, 17, 22, 27, 28, 30, 34, 35, 40.
 *  (Eski Kukla basamakları 5, 13, 14, 24, 25, 28, 36, 38 sırayla 15 Kelime / Çizme / Anlatma oldu.)
 */
const FIXED_STEPS: Readonly<Record<number, GameMode>> = {
  ...Object.fromEntries([1, 2, 3, 4, 6, 11, 12, 14, 17, 22, 27, 28, 30, 34, 35, 40].map((n) => [n, 'anlatma' as const])),
  ...Object.fromEntries([7, 8, 10, 13, 15, 16, 20, 21, 25, 32, 33, 38].map((n) => [n, 'cizme' as const])),
  ...Object.fromEntries([5, 9, 18, 19, 24, 36, 37, 42].map((n) => [n, 'onbes' as const])),
};

export function stepKind(step: number): StepKind {
  return FIXED_STEPS[step] ?? 'karisik';
}

/** Tahta önceden hesaplanır; render sırasında yeniden üretilmez. Index 0 = basamak 1. */
export const BOARD_STEPS: readonly StepKind[] = Object.freeze(
  Array.from({ length: BOARD_SIZE }, (_, i) => stepKind(i + 1)),
);

/**
 * Takımın oynayacağı basamak: tahtadaki konumunun bir sonraki basamağı.
 * Konum 0 = başlangıç (henüz tahtaya çıkmamış).
 */
export function nextStepFor(position: number): number {
  return Math.min(position + 1, BOARD_SIZE);
}

/** Tur net skoru adım olarak uygulanır; negatif skor geri götürmez. */
export function advance(position: number, netScore: number): number {
  return Math.min(BOARD_SIZE, position + Math.max(0, netScore));
}

export function hasWon(position: number): boolean {
  return position >= BOARD_SIZE;
}

/** Kalan pass hakkı (kelime bazlı, tur genelinde toplam). */
export function passesLeft(mode: GameMode, passesUsed: number): number {
  return Math.max(0, MODE_CONFIG[mode].passLimit - passesUsed);
}

/**
 * Pass'in maliyeti: Anlatma'da 1; üçlü kartlarda kartta tik atılmamış kelime sayısı.
 * Sunucu (motor) ve istemci (buton disabled kuralı) aynı fonksiyonu kullanır.
 */
export function passCost(card: Card): number {
  return card.kind !== 'triple' ? 1 : card.solved.filter((v) => !v).length;
}

export function canPass(mode: GameMode, passesUsed: number, card: Card | null): boolean {
  return card !== null && passesLeft(mode, passesUsed) >= passCost(card);
}
