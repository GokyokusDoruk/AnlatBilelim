/**
 * Hazır seçiciler. `useShallow` dizi/nesne döndüren seçicilerde gereksiz
 * render'ı önler. Bileşenler store'un tamamına ASLA abone olmamalıdır.
 */
import { useShallow } from 'zustand/react/shallow';
import type { Player, Role, TeamId } from '@shared/types';
import { useGameStore } from './gameStore';

export const usePhase = () => useGameStore((s) => s.phase);
export const useConnectionStatus = () => useGameStore((s) => s.status);
export const useRoomCode = () => useGameStore((s) => s.code);
export const useNotice = () => useGameStore((s) => s.notice);
export const useRound = () => useGameStore((s) => s.round);
export const useBoard = () => useGameStore((s) => s.board);

export const useSelf = (): Player | undefined =>
  useGameStore((s) => (s.selfId ? s.players.find((p) => p.id === s.selfId) : undefined));

export const useTeamPlayers = (team: TeamId | null): Player[] =>
  useGameStore(useShallow((s) => s.players.filter((p) => p.team === team)));

/** Kendi rolüm: tur yoksa null. */
export const useMyRole = (): Role | null =>
  useGameStore((s) => {
    const r = s.round;
    if (!r || !s.selfId) return null;
    if (r.narratorId === s.selfId) return 'narrator';
    if (r.observerId === s.selfId) return 'observer';
    // Gözlemci'nin takım arkadaşları rakip takımdadır (anlatan takım = round.team).
    const me = s.players.find((p) => p.id === s.selfId);
    if (me && me.team !== null && me.team !== r.team) return 'observerMate';
    return 'listener';
  });

export const usePlayerName = (id: string | null | undefined): string =>
  useGameStore((s) => (id ? (s.players.find((p) => p.id === id)?.name ?? '') : ''));

/** Anlatıcı/Gözlemci tur sırasında yalnızca kartına odaklanır; tahta ve skor gizlenir. */
export const useFocusMode = (): boolean =>
  useGameStore((s) => {
    const r = s.round;
    if (s.phase !== 'round' || !r || !s.selfId) return false;
    return r.narratorId === s.selfId || r.observerId === s.selfId;
  });
