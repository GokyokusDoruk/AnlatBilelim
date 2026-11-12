/**
 * Bir odanın sunucu tarafı durumu ve saf (yan etkisiz) dönüşümleri.
 * Durable Object yalnızca I/O (WebSocket, depolama, alarm) ile ilgilenir;
 * oyun kuralları bu modülde ve Task 3+ ile eklenecek motor dosyalarında yaşar.
 */
import { MAX_PLAYERS_PER_ROOM } from '../../shared/constants';
import type { BoardState, Card, GameMode, Player, RoomPhase, RoomSnapshot, RoundPublicState, RoundSummary, TeamId } from '../../shared/types';

export interface RoomData {
  code: string;
  createdAt: number;
  /** Son anlamlı oyuncu etkileşimi (ping sayılmaz). TTL bunu baz alır. */
  lastActivity: number;
  phase: RoomPhase;
  players: Player[];
  board: BoardState;
  turnTeam: TeamId;
  round: RoundPublicState | null;
  lastSummary: RoundSummary | null;
  winner: TeamId | null;
  roulette: { result: GameMode; startedAt: number; seed: number } | null;

  // --- Sadece sunucuda tutulan alanlar (snapshot'a girmez) ---
  /** Aktif kart. Yalnızca Anlatıcı ve Gözlemci'ye 'private' mesajıyla gönderilir. */
  roundCard: Card | null;
  /** Takım içi adil rotasyon: her takım için bir sonraki anlatıcı / gözlemci sırası. */
  narratorCursor: Record<TeamId, number>;
  observerCursor: Record<TeamId, number>;
  /** Sıradaki zaman tabanlı geçiş (çark bitişi, tur sonu, özet otomatik kapanışı). Yoksa null. */
  phaseDeadline: number | null;
}

export function createRoomData(code: string, now: number): RoomData {
  return {
    code,
    createdAt: now,
    lastActivity: now,
    phase: 'lobby',
    players: [],
    board: { positions: { A: 0, B: 0 } },
    turnTeam: 'A',
    round: null,
    lastSummary: null,
    winner: null,
    roulette: null,
    roundCard: null,
    narratorCursor: { A: 0, B: 0 },
    observerCursor: { A: 0, B: 0 },
    phaseDeadline: null,
  };
}

export function findPlayer(room: RoomData, playerId: string): Player | undefined {
  return room.players.find((p) => p.id === playerId);
}

export type JoinResult = { ok: true; player: Player; reconnected: boolean } | { ok: false; reason: 'room_full' };

/** Yeni oyuncu ekler ya da aynı playerId ile dönen oyuncuyu yeniden bağlar. */
export function joinPlayer(room: RoomData, playerId: string, name: string, now: number): JoinResult {
  const existing = findPlayer(room, playerId);
  if (existing) {
    existing.connected = true;
    existing.name = name;
    return { ok: true, player: existing, reconnected: true };
  }
  if (room.players.length >= MAX_PLAYERS_PER_ROOM) return { ok: false, reason: 'room_full' };

  const player: Player = {
    id: playerId,
    name,
    team: null,
    ready: false,
    connected: true,
    isHost: room.players.length === 0,
    joinedAt: now,
  };
  room.players.push(player);
  ensureHost(room);
  return { ok: true, player, reconnected: false };
}

export function markDisconnected(room: RoomData, playerId: string): void {
  const p = findPlayer(room, playerId);
  if (p) p.connected = false;
}

/** Oyuncu odadan kendi isteğiyle çıkar. */
export function removePlayer(room: RoomData, playerId: string): void {
  room.players = room.players.filter((p) => p.id !== playerId);
  ensureHost(room);
}

/** Her zaman tam bir host olsun: yoksa en eski bağlı oyuncuya devredilir. */
export function ensureHost(room: RoomData): void {
  const hosts = room.players.filter((p) => p.isHost);
  if (hosts.length === 1) return;
  for (const p of room.players) p.isHost = false;
  const candidate =
    [...room.players].sort((a, b) => a.joinedAt - b.joinedAt).find((p) => p.connected) ?? room.players[0];
  if (candidate) candidate.isHost = true;
}

export function connectedCount(room: RoomData): number {
  let n = 0;
  for (const p of room.players) if (p.connected) n++;
  return n;
}

export function toSnapshot(room: RoomData): RoomSnapshot {
  return {
    code: room.code,
    phase: room.phase,
    players: room.players,
    board: room.board,
    turnTeam: room.turnTeam,
    round: room.round,
    lastSummary: room.lastSummary,
    winner: room.winner,
    roulette: room.roulette,
  };
}
