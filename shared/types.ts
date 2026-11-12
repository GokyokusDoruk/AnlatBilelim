/**
 * Alan modeli (domain) tipleri. Sunucu tek otoritedir: istemci bu tipleri
 * yalnızca sunucudan gelen anlık görüntüyü (snapshot) göstermek için kullanır.
 */

export type TeamId = 'A' | 'B';
export const TEAM_IDS: readonly TeamId[] = ['A', 'B'];

/** Oyun modları. */
export type GameMode = 'anlatma' | 'cizme' | 'kukla' | 'onbes';

/** Tahtadaki basamak türü: 31-45 arası "karisik" basamaklarda mod rulet ile seçilir. */
export type StepKind = GameMode | 'karisik';

/** Bir turdaki rol. */
export type Role = 'narrator' | 'observer' | 'listener';

export interface Player {
  readonly id: string;
  name: string;
  /** Lobiye ilk girişte henüz takım seçilmemiş olabilir. */
  team: TeamId | null;
  ready: boolean;
  connected: boolean;
  /** Odayı kuran (veya devralan) oyuncu. */
  isHost: boolean;
  /** Katılma sırası; takım içi anlatıcı rotasyonu bunu kullanır. */
  joinedAt: number;
}

export type RoomPhase =
  | 'lobby'
  | 'roulette' // Karışık basamakta mod çarkı dönüyor
  | 'pre_round' // Roller atandı, Gözlemci "Tur Başlat" bekleniyor
  | 'round' // Süre işliyor
  | 'round_summary'
  | 'game_over';

// ---------------------------------------------------------------------------
// Kartlar
// ---------------------------------------------------------------------------

/** Anlatma modu kartı: 1 ana kelime + 5 yasaklı kelime. */
export interface TabuCard {
  readonly kind: 'tabu';
  readonly word: string;
  readonly forbidden: readonly [string, string, string, string, string];
  /** Gözlemcinin "kullandı" diye işaretlediği yasaklı kelimeler (yeşil görünür). */
  readonly hit: readonly boolean[];
}

/** Çizme / Kukla / 15 Kelime kartı: 3 kelime, her biri ayrı ayrı "bilindi" işaretlenir. */
export interface TripleCard {
  readonly kind: 'triple';
  readonly words: readonly [string, string, string];
  /** words ile aynı index: gözlemcinin attığı tikler. */
  readonly solved: readonly [boolean, boolean, boolean];
}

/** Kukla kartı: tek kelime; animasyon herkese `RoundPublicState.anim` ile (kelimesiz) gösterilir. */
export interface KuklaCard {
  readonly kind: 'kukla';
  readonly word: string;
  readonly clip: number;
  readonly level: WordLevel;
}

export type Card = TabuCard | TripleCard | KuklaCard;

// ---------------------------------------------------------------------------
// Tur ve tahta
// ---------------------------------------------------------------------------

export interface BoardState {
  /** 0 = başlangıç, 45 = bitiş. */
  positions: Record<TeamId, number>;
}

export interface RoundPublicState {
  readonly mode: GameMode;
  /** Bu turun oynandığı basamak (1..45). */
  readonly step: number;
  readonly team: TeamId;
  readonly narratorId: string;
  readonly observerId: string;
  /** Sunucu saatine göre (epoch ms) bitiş; null = henüz başlamadı. */
  readonly endsAt: number | null;
  readonly passesUsed: number;
  readonly correct: number;
  readonly forbiddenHits: number;
  /** Sadece 15 Kelime modunda; kalan ipucu hakkı. */
  readonly cluesLeft: number | null;
  /** Sadece Kukla: oynayan animasyon. Kelime içermez; klip `startedAt`'ten itibaren loop'ta döner. */
  readonly anim: { readonly clip: number; readonly level: WordLevel; readonly startedAt: number } | null;
}

/**
 * Kart yalnızca Anlatıcı ve Gözlemci'ye gönderilir. Dinleyicilerin istemcisine
 * hiç ulaşmaz (hile yapılamaz, gereksiz veri taşınmaz).
 */
export interface RoundPrivateState {
  readonly card: Card | null;
}

export interface RoundSummary {
  readonly team: TeamId;
  readonly mode: GameMode;
  readonly correct: number;
  readonly forbiddenHits: number;
  readonly passesUsed: number;
  /** max(0, correct - forbiddenHits) */
  readonly stepsAdvanced: number;
  /** Turdan sonra takımın tahtadaki konumu (0..45). */
  readonly newPosition: number;
  /** Tur 15 Kelime hakkı bittiği için mi sona erdi? */
  readonly endedByClueLimit: boolean;
}

/** Kelime seviyesi: 1 Kolay, 2 Orta, 3 Zor, 4 Çok Zor. Oyunu kuran lobide seçer. */
export type WordLevel = 1 | 2 | 3 | 4;
export const WORD_LEVELS: readonly WordLevel[] = [1, 2, 3, 4];
export const LEVEL_LABELS: Readonly<Record<WordLevel, string>> = { 1: 'Kolay', 2: 'Orta', 3: 'Zor', 4: 'Çok Zor' };

export interface RoomSnapshot {
  readonly code: string;
  readonly level: WordLevel;
  readonly phase: RoomPhase;
  readonly players: readonly Player[];
  readonly board: BoardState;
  /** Sıradaki/aktif takım. */
  readonly turnTeam: TeamId;
  readonly round: RoundPublicState | null;
  readonly lastSummary: RoundSummary | null;
  readonly winner: TeamId | null;
  /** Karışık basamakta çarkın sonucu ve animasyon başlangıcı (senkron rulet, Task 4). */
  readonly roulette: { readonly result: GameMode; readonly startedAt: number; readonly seed: number } | null;
}
