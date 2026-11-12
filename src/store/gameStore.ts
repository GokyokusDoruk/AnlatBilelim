/**
 * İstemci durumu (Zustand).
 *
 * Kurallar:
 *  - Sunucudan gelen anlık görüntü (snapshot) alanlara ayrıştırılarak saklanır.
 *    Bileşenler yalnızca ihtiyaç duydukları dilime (selector) abone olur;
 *    örneğin oyuncu listesi değişince sayaç bileşeni yeniden render edilmez.
 *  - Değişmeyen alanların referansı korunur (structural sharing), böylece
 *    selector'lar gereksiz yere tetiklenmez.
 *  - Yüksek frekanslı veriler (çizim noktaları, kukla kareleri, saat farkı)
 *    ASLA store'a yazılmaz; doğrudan canvas/three.js katmanına akar.
 */
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { ServerMessage } from '@shared/protocol';
import type { RoomSnapshot, RoundPrivateState } from '@shared/types';
import type { ConnectionStatus } from '../net/RoomSocket';

type SnapshotFields = Omit<RoomSnapshot, 'code'>;

export interface GameState extends SnapshotFields {
  code: string | null;
  selfId: string | null;
  status: ConnectionStatus | 'idle';
  /** Kapanış sebebi / son hata (kullanıcıya gösterilir). */
  notice: string | null;
  privateData: RoundPrivateState | null;
  hasSnapshot: boolean;
}

interface GameActions {
  setStatus(status: ConnectionStatus, notice?: string | null): void;
  applyServerMessage(msg: ServerMessage): void;
  reset(): void;
}

const initialState: GameState = {
  code: null,
  selfId: null,
  status: 'idle',
  notice: null,
  privateData: null,
  hasSnapshot: false,
  phase: 'lobby',
  players: [],
  board: { positions: { A: 0, B: 0 } },
  turnTeam: 'A',
  round: null,
  lastSummary: null,
  winner: null,
  roulette: null,
};

/** JSON eşitliği küçük nesnelerde ucuzdur; değişmemiş dilimin referansını korur. */
function keep<T>(prev: T, next: T): T {
  if (prev === next) return prev;
  return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
}

function mergeSnapshot(state: GameState, s: RoomSnapshot): Partial<GameState> {
  return {
    hasSnapshot: true,
    code: s.code,
    phase: s.phase,
    turnTeam: s.turnTeam,
    winner: s.winner,
    players: keep(state.players, s.players),
    board: keep(state.board, s.board),
    round: keep(state.round, s.round),
    lastSummary: keep(state.lastSummary, s.lastSummary),
    roulette: keep(state.roulette, s.roulette),
    // Tur aktif değilse özel kart verisini bellekte tutma.
    privateData: s.phase === 'round' ? state.privateData : null,
  };
}

export const useGameStore = create<GameState & GameActions>()(
  subscribeWithSelector((set) => ({
    ...initialState,

    setStatus: (status, notice) => set(notice === undefined ? { status } : { status, notice }),

    applyServerMessage: (msg) => {
      switch (msg.t) {
        case 'welcome':
          set((st) => ({ ...mergeSnapshot(st, msg.snapshot), selfId: msg.you, notice: null }));
          return;
        case 'state':
          set((st) => mergeSnapshot(st, msg.snapshot));
          return;
        case 'private':
          set({ privateData: msg.data });
          return;
        case 'roulette':
          set({ roulette: { result: msg.result, startedAt: msg.startedAt, seed: msg.seed } });
          return;
        case 'error':
          set({ notice: msg.message });
          return;
        case 'pong':
          return; // RoomSocket içinde işlenir
      }
    },

    reset: () => set(initialState),
  })),
);
