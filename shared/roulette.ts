/**
 * Karışık mod çarkı: sunucu sonucu ve `seed`i belirler, her istemci aynı açıyı
 * `startedAt`'tan geçen süreye göre kendisi hesaplar. Böylece tüm cihazlarda çark aynı
 * anda aynı yerde durur, geç bağlanan oyuncu da doğru kareyi görür; ağ üzerinden kare
 * verisi akmaz.
 */
import { ALL_MODES } from './board';
import type { GameMode } from './types';

/** Çarkın dönüş süresi. Sunucudaki ROULETTE_MS'den kısadır; kalan süre sonuç gösterimidir. */
export const ROULETTE_SPIN_MS = 4_000;
const FULL_SPINS = 5;
export const SEGMENT_DEG = 360 / ALL_MODES.length;

/** Küçük, hızlı, tohumlu rastgele sayı üreteci (mulberry32). */
function seededUnit(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Çarkın son açısı (derece, saat yönünde). İşaretçi çarkın tepesindedir. */
export function rouletteFinalAngle(result: GameMode, seed: number): number {
  const index = ALL_MODES.indexOf(result);
  const center = index * SEGMENT_DEG + SEGMENT_DEG / 2;
  // Dilimin tam ortası yerine seed'e bağlı doğal bir sapma (dilimin ±%35'i).
  const jitter = (seededUnit(seed) - 0.5) * SEGMENT_DEG * 0.7;
  return FULL_SPINS * 360 - (center + jitter);
}

const easeOutQuart = (p: number) => 1 - Math.pow(1 - p, 4);

export function rouletteAngle(result: GameMode, seed: number, elapsedMs: number): number {
  const p = Math.min(1, Math.max(0, elapsedMs / ROULETTE_SPIN_MS));
  return rouletteFinalAngle(result, seed) * easeOutQuart(p);
}

/** Çark `angle` derecedeyken işaretçinin altındaki mod. */
export function modeAtPointer(angle: number): GameMode {
  const a = (((-angle) % 360) + 360) % 360;
  return ALL_MODES[Math.min(ALL_MODES.length - 1, Math.floor(a / SEGMENT_DEG))]!;
}
