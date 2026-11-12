/**
 * Oyun motoru: lobi, takım seçimi, rol rotasyonu, tur akışı, skor ve pass matematiği.
 *
 * Saf mantık: Cloudflare API'sine dokunmaz. `RoomData`'yı doğrudan değiştirir ve
 * zaman (`now`), rastgelelik (`rand`) ve kart destesi bağlam olarak enjekte edilir;
 * bu yüzden vitest ile deterministik test edilebilir. Durable Object yalnızca
 * I/O yapar (WebSocket, depolama, alarm).
 */
import { advance, ALL_MODES, canPass, MODE_CONFIG, nextStepFor, passCost, stepKind, hasWon } from '../../shared/board';
import { MIN_PLAYERS_PER_TEAM, ROULETTE_MS, SUMMARY_AUTO_MS } from '../../shared/constants';
import type { ErrorCode } from '../../shared/protocol';
import type { CardDeck } from '../../shared/words';
import type { GameMode, Player, TeamId, TripleCard } from '../../shared/types';
import { findPlayer, type RoomData } from './RoomData';

export interface EngineCtx {
  now: number;
  deck: CardDeck;
  rand: () => number;
}

export type ActionResult = { ok: true } | { ok: false; code: ErrorCode; message: string };

const OK: ActionResult = { ok: true };
const fail = (code: ErrorCode, message: string): ActionResult => ({ ok: false, code, message });

export const otherTeam = (t: TeamId): TeamId => (t === 'A' ? 'B' : 'A');

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

/** Takımın bağlı oyuncuları, katılma sırasına göre (rotasyon için sabit sıralama). */
export function connectedTeamPlayers(room: RoomData, team: TeamId): Player[] {
  return room.players.filter((p) => p.team === team && p.connected).sort((a, b) => a.joinedAt - b.joinedAt);
}

function teamSize(room: RoomData, team: TeamId): number {
  let n = 0;
  for (const p of room.players) if (p.team === team) n++;
  return n;
}

export function inGame(room: RoomData): boolean {
  return room.phase !== 'lobby';
}

function pickRotating(list: Player[], cursor: number): Player | null {
  if (list.length === 0) return null;
  return list[cursor % list.length]!;
}

// ---------------------------------------------------------------------------
// Lobi
// ---------------------------------------------------------------------------

export function setTeam(room: RoomData, playerId: string, team: TeamId): ActionResult {
  const p = findPlayer(room, playerId);
  if (!p) return fail('not_allowed', 'Oyuncu bulunamadı.');
  if (team !== 'A' && team !== 'B') return fail('bad_message', 'Geçersiz takım.');
  // Oyun sürerken takım değiştirilemez; sadece takımsız kalan geç katılımcı takım seçebilir.
  if (inGame(room) && p.team !== null) return fail('not_allowed', 'Oyun sırasında takım değiştirilemez.');
  p.team = team;
  p.ready = false;
  return OK;
}

/** Kelime seviyesi: yalnızca oda kurucusu, yalnızca lobide. */
export function setLevel(room: RoomData, playerId: string, level: number): ActionResult {
  const p = findPlayer(room, playerId);
  if (!p?.isHost) return fail('not_allowed', 'Seviyeyi yalnızca oda kurucusu seçebilir.');
  if (room.phase !== 'lobby') return fail('not_allowed', 'Oyun başladıktan sonra seviye değişmez.');
  if (level !== 1 && level !== 2 && level !== 3 && level !== 4) return fail('bad_message', 'Geçersiz seviye.');
  room.level = level;
  return OK;
}

export function setReady(room: RoomData, playerId: string, ready: boolean, ctx: EngineCtx): ActionResult {
  const p = findPlayer(room, playerId);
  if (!p) return fail('not_allowed', 'Oyuncu bulunamadı.');
  if (room.phase !== 'lobby') return fail('not_allowed', 'Oyun zaten başladı.');
  if (p.team === null) return fail('not_allowed', 'Önce bir takım seç.');
  p.ready = ready;
  if (canStart(room)) startGame(room, ctx);
  return OK;
}

/** Herkes hazır, hiçbir oyuncu takımsız değil ve her takımda en az 2 oyuncu var. */
export function canStart(room: RoomData): boolean {
  if (room.phase !== 'lobby') return false;
  if (teamSize(room, 'A') < MIN_PLAYERS_PER_TEAM || teamSize(room, 'B') < MIN_PLAYERS_PER_TEAM) return false;
  return room.players.every((p) => p.team !== null && (p.ready || !p.connected));
}

// ---------------------------------------------------------------------------
// Oyun / tur akışı
// ---------------------------------------------------------------------------

export function startGame(room: RoomData, ctx: EngineCtx): void {
  room.board = { positions: { A: 0, B: 0 } };
  room.turnTeam = 'A';
  room.winner = null;
  room.lastSummary = null;
  room.narratorCursor = { A: 0, B: 0 };
  room.observerCursor = { A: 0, B: 0 };
  beginTurn(room, ctx);
}

/** Lobiye dön: tahta ve hazır durumları sıfırlanır, oyuncular odada kalır. */
export function resetToLobby(room: RoomData): void {
  room.phase = 'lobby';
  room.round = null;
  room.roundCard = null;
  room.roulette = null;
  room.lastSummary = null;
  room.winner = null;
  room.phaseDeadline = null;
  room.board = { positions: { A: 0, B: 0 } };
  room.turnTeam = 'A';
  for (const p of room.players) p.ready = false;
}

/** Sıradaki takım için rolleri seçer, basamağın modunu belirler (Karışık ise çark döner). */
export function beginTurn(room: RoomData, ctx: EngineCtx): void {
  const team = room.turnTeam;
  const rival = otherTeam(team);
  const narrator = pickRotating(connectedTeamPlayers(room, team), room.narratorCursor[team]);
  const observer = pickRotating(connectedTeamPlayers(room, rival), room.observerCursor[rival]);
  if (!narrator || !observer) {
    // Bir takımda bağlı oyuncu kalmadı: oyunu sürdürmek anlamsız.
    resetToLobby(room);
    return;
  }

  const step = nextStepFor(room.board.positions[team]);
  const kind = stepKind(step);
  const mode: GameMode =
    kind === 'karisik' ? ALL_MODES[Math.floor(ctx.rand() * ALL_MODES.length)]! : kind;

  // Kukla turu kimsenin sırasını tüketmez: imleçler ilerlemez, sonraki tur aynı oyuncuyla devam eder.
  if (mode !== 'kukla') {
    room.narratorCursor[team]++;
    room.observerCursor[rival]++;
  }

  room.round = {
    mode,
    step,
    team,
    narratorId: narrator.id,
    observerId: observer.id,
    endsAt: null,
    passesUsed: 0,
    correct: 0,
    forbiddenHits: 0,
    cluesLeft: MODE_CONFIG[mode].clueLimit ?? null,
    anim: null,
  };
  room.roundCard = null;

  if (kind === 'karisik') {
    room.phase = 'roulette';
    room.roulette = { result: mode, startedAt: ctx.now, seed: Math.floor(ctx.rand() * 0x7fffffff) };
    room.phaseDeadline = ctx.now + ROULETTE_MS;
  } else {
    room.phase = 'pre_round';
    room.roulette = null;
    room.phaseDeadline = null;
  }
}

/** Gözlemci "Tur Başlat"a bastı: süre işlemeye başlar, kartlar görünür olur. */
export function startRound(room: RoomData, playerId: string, ctx: EngineCtx): ActionResult {
  const r = room.round;
  if (room.phase !== 'pre_round' || !r) return fail('not_allowed', 'Şu an tur başlatılamaz.');
  if (r.observerId !== playerId) return fail('not_allowed', 'Turu yalnızca Gözlemci başlatabilir.');
  const endsAt = ctx.now + MODE_CONFIG[r.mode].durationSec * 1000;
  room.round = { ...r, endsAt };
  room.phase = 'round';
  room.phaseDeadline = endsAt;
  room.roulette = null;
  dealCard(room, ctx);
  return OK;
}

function dealCard(room: RoomData, ctx: EngineCtx): void {
  const mode = room.round!.mode;
  if (mode === 'kukla') {
    const card = ctx.deck.kuklaCard(room.level);
    room.roundCard = card;
    // Animasyon kelimesiz herkese yayınlanır; yeni kelime = yeni başlangıç zamanı.
    room.round = { ...room.round!, anim: { clip: card.clip, level: card.level, startedAt: ctx.now } };
    return;
  }
  room.roundCard = mode === 'anlatma' ? ctx.deck.tabuCard(room.level) : ctx.deck.tripleCard(mode, room.level);
}

/** Aktif tur için ortak kontrol; süre dolmuşsa turu kapatır. */
function activeRound(room: RoomData, ctx: EngineCtx): ActionResult | null {
  const r = room.round;
  if (room.phase !== 'round' || !r || r.endsAt === null) return fail('not_allowed', 'Tur şu an aktif değil.');
  if (ctx.now >= r.endsAt) {
    endRound(room, ctx, false);
    return fail('not_allowed', 'Süre doldu.');
  }
  return null;
}

/** Anlatma: Doğru Bilindi (+1). Üçlü kart modları: `index`teki kelimeye tik. */
export function markCorrect(room: RoomData, playerId: string, index: number | undefined, ctx: EngineCtx): ActionResult {
  const blocked = activeRound(room, ctx);
  if (blocked) return blocked;
  const r = room.round!;
  if (r.observerId !== playerId) return fail('not_allowed', 'Bunu yalnızca Gözlemci yapabilir.');
  const card = room.roundCard;
  if (!card) return fail('not_allowed', 'Kart yok.');

  if (card.kind === 'tabu' || card.kind === 'kukla') {
    room.round = { ...r, correct: r.correct + 1 };
    dealCard(room, ctx);
    return OK;
  }

  if (index === undefined || !Number.isInteger(index) || index < 0 || index > 2) {
    return fail('bad_message', 'Geçersiz kelime.');
  }
  if (card.solved[index]) {
    // Gözlemci aynı kelimeye tekrar basarsa "bilemedi" olarak geri alınır.
    const undone = card.solved.map((v, i) => (i === index ? false : v)) as unknown as TripleCard['solved'];
    room.round = { ...r, correct: Math.max(0, r.correct - 1) };
    room.roundCard = { ...card, solved: undone };
    return OK;
  }
  const solved = card.solved.map((v, i) => (i === index ? true : v)) as unknown as TripleCard['solved'];
  room.round = { ...r, correct: r.correct + 1 };
  if (solved.every(Boolean)) dealCard(room, ctx); // 3'ü de bilindi: otomatik yeni kart
  else room.roundCard = { ...card, solved };
  return OK;
}

/**
 * Anlatma, yasaklı kelime.
 *  - `index` verilirse: o yasaklı kelime "kullanıldı" olarak işaretlenir (yeşil); aynı kelimeye tekrar basmak geri alır.
 *    Kart başına tek -1: ilk işaret -1, işaretlerin hepsi geri alınırsa -1 iade.
 *  - `index` yoksa: kart yanmış sayılır, yeni kart gelir (işaret yoksa -1 burada yazılır).
 */
export function markForbidden(room: RoomData, playerId: string, index: number | undefined, ctx: EngineCtx): ActionResult {
  const blocked = activeRound(room, ctx);
  if (blocked) return blocked;
  const r = room.round!;
  if (r.mode !== 'anlatma') return fail('not_allowed', 'Bu modda yasaklı kelime yok.');
  if (r.observerId !== playerId) return fail('not_allowed', 'Bunu yalnızca Gözlemci yapabilir.');
  const card = room.roundCard;
  if (!card || card.kind !== 'tabu') return fail('not_allowed', 'Kart yok.');
  const anyHit = card.hit.some(Boolean);

  if (index === undefined) {
    room.round = { ...r, forbiddenHits: r.forbiddenHits + (anyHit ? 0 : 1) };
    dealCard(room, ctx);
    return OK;
  }
  if (!Number.isInteger(index) || index < 0 || index >= card.forbidden.length) return fail('bad_message', 'Geçersiz kelime.');
  const hit = card.hit.map((v, i) => (i === index ? !v : v));
  const nowAny = hit.some(Boolean);
  const delta = nowAny === anyHit ? 0 : nowAny ? 1 : -1;
  room.round = { ...r, forbiddenHits: r.forbiddenHits + delta };
  room.roundCard = { ...card, hit };
  return OK;
}

/** 15 Kelime: "Kelime Kullanıldı (-1)". Sayaç 0'a inince tur süre bitmese de sona erer. */
export function useClue(room: RoomData, playerId: string, ctx: EngineCtx): ActionResult {
  const blocked = activeRound(room, ctx);
  if (blocked) return blocked;
  const r = room.round!;
  if (r.cluesLeft === null) return fail('not_allowed', 'Bu modda ipucu sayacı yok.');
  if (r.observerId !== playerId) return fail('not_allowed', 'Bunu yalnızca Gözlemci yapabilir.');
  const cluesLeft = r.cluesLeft - 1;
  room.round = { ...r, cluesLeft };
  if (cluesLeft <= 0) endRound(room, ctx, true);
  return OK;
}

/**
 * Pass (yalnızca Anlatıcı).
 *  - Anlatma: 1 pass hakkı, yeni kart. Hak 3 olunca reddedilir.
 *  - Üçlü kartlar: kartta tik atılmamış kelime sayısı kadar hak düşer (turda toplam 3).
 *    Kalan hak, bilinmemiş kelime sayısından azsa reddedilir. Bilinenler zaten skora yazılmıştır.
 */
export function pass(room: RoomData, playerId: string, ctx: EngineCtx): ActionResult {
  const blocked = activeRound(room, ctx);
  if (blocked) return blocked;
  const r = room.round!;
  if (r.narratorId !== playerId) return fail('not_allowed', 'Pass yalnızca Anlatıcı içindir.');
  const card = room.roundCard;
  if (!card) return fail('not_allowed', 'Kart yok.');
  if (!canPass(r.mode, r.passesUsed, card)) return fail('not_allowed', 'Yeterli pass hakkın yok.');
  room.round = { ...r, passesUsed: r.passesUsed + passCost(card) };
  dealCard(room, ctx);
  return OK;
}

/** Turu bitirir: net skor adıma çevrilir (negatif = 0), kazanan kontrol edilir. */
export function endRound(room: RoomData, ctx: EngineCtx, endedByClueLimit: boolean): void {
  const r = room.round;
  if (!r || (room.phase !== 'round')) return;
  const net = r.correct - r.forbiddenHits;
  const before = room.board.positions[r.team];
  const after = advance(before, net);
  room.board = { positions: { ...room.board.positions, [r.team]: after } };
  room.lastSummary = {
    team: r.team,
    mode: r.mode,
    correct: r.correct,
    forbiddenHits: r.forbiddenHits,
    passesUsed: r.passesUsed,
    stepsAdvanced: after - before,
    newPosition: after,
    endedByClueLimit,
  };
  room.roundCard = null;
  if (hasWon(after)) {
    room.winner = r.team;
    room.phase = 'game_over';
    room.phaseDeadline = null;
  } else {
    room.phase = 'round_summary';
    room.phaseDeadline = ctx.now + SUMMARY_AUTO_MS;
  }
}

/** Özet ekranından sonraki tura geç (kurucu erken geçebilir) / oyun bittiyse lobiye dön. */
export function continueFromSummary(room: RoomData, playerId: string, ctx: EngineCtx): ActionResult {
  const p = findPlayer(room, playerId);
  if (!p?.isHost) return fail('not_allowed', 'Bunu yalnızca oda kurucusu yapabilir.');
  if (room.phase === 'game_over') {
    resetToLobby(room);
    return OK;
  }
  if (room.phase !== 'round_summary') return fail('not_allowed', 'Şu an devam edilemez.');
  advanceTurn(room, ctx);
  return OK;
}

function advanceTurn(room: RoomData, ctx: EngineCtx): void {
  room.turnTeam = otherTeam(room.turnTeam);
  room.round = null;
  beginTurn(room, ctx);
}

/** Alarm: süresi dolan faz geçişini uygular. */
export function onDeadline(room: RoomData, ctx: EngineCtx): boolean {
  if (room.phaseDeadline === null || ctx.now < room.phaseDeadline) return false;
  switch (room.phase) {
    case 'roulette':
      room.phase = 'pre_round';
      room.phaseDeadline = null;
      return true;
    case 'round':
      endRound(room, ctx, false);
      return true;
    case 'round_summary':
      advanceTurn(room, ctx);
      return true;
    default:
      room.phaseDeadline = null;
      return false;
  }
}

/**
 * Oyuncu ayrıldı veya bağlantısı koptu: oyun akışını güvenli tut.
 *  - Bir takımda hiç bağlı oyuncu kalmadıysa lobiye dönülür.
 *  - Tur öncesinde (çark/Tur Başlat bekleme) Anlatıcı veya Gözlemci düştüyse roller yeniden seçilir.
 *  - Tur sürerken süre işlemeye devam eder; rol sahibi dönerse kaldığı yerden devam eder.
 */
export function onRosterChanged(room: RoomData, ctx: EngineCtx): void {
  if (room.phase === 'lobby') {
    return;
  }
  const bothTeamsPresent = connectedTeamPlayers(room, 'A').length > 0 && connectedTeamPlayers(room, 'B').length > 0;
  if (!bothTeamsPresent) {
    resetToLobby(room);
    return;
  }
  if (room.phase === 'pre_round' || room.phase === 'roulette') {
    const r = room.round;
    const narrator = r && findPlayer(room, r.narratorId);
    const observer = r && findPlayer(room, r.observerId);
    if (!narrator?.connected || !observer?.connected) {
      // Roller yeniden seçilir; çark yeniden dönmesin diye aynı takım ve basamak korunur.
      room.round = null;
      beginTurn(room, ctx);
    }
  }
}

/** Sadece geliştirme: tahtayı ayarlar ve sıradaki turu yeni basamağa göre yeniden başlatır. */
export function devSetBoard(room: RoomData, a: number, b: number, ctx: EngineCtx): ActionResult {
  if (!inGame(room) || !Number.isInteger(a) || !Number.isInteger(b)) return fail('bad_message', 'Geçersiz istek.');
  const clamp = (n: number) => Math.max(0, Math.min(44, n));
  room.board = { positions: { A: clamp(a), B: clamp(b) } };
  room.round = null;
  room.roundCard = null;
  beginTurn(room, ctx);
  return OK;
}
