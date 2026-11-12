/**
 * Aktif oda bağlantısının tekil (singleton) yöneticisi. Aynı anda en fazla bir
 * oda soketi yaşar; yeni bağlantı açılmadan önce eskisi tamamen dispose edilir.
 */
import type { BinaryChannel, ClientMessage } from '@shared/protocol';
import { getPlayerId } from '../lib/identity';
import { roomSocketUrl } from '../lib/api';
import { useGameStore } from '../store/gameStore';
import { RoomSocket } from './RoomSocket';

let active: RoomSocket | null = null;
/** Anlatıcı tuvali: dinleyici çizimi yeniden isteyince tetiklenir. */
const resyncListeners = new Set<() => void>();

const CLOSE_NOTICES: Record<number, string> = {
  4000: 'Oda kapandı (uzun süre hareketsiz kaldı).',
  4001: 'Bu oyuncu başka bir sekmeden bağlandı.',
  4002: 'Oda dolu.',
  4003: 'Geçersiz isim.',
};

export function connectRoom(code: string, name: string): () => void {
  disconnectRoom();
  const store = useGameStore.getState();
  store.reset();

  const socket = new RoomSocket(roomSocketUrl(code), {
    onOpen: (s) => s.send({ t: 'hello', playerId: getPlayerId(), name }),
    onMessage: (msg) => {
      if (msg.t === 'draw:resync') {
        for (const l of resyncListeners) l();
        return;
      }
      useGameStore.getState().applyServerMessage(msg);
    },
    onStatus: (status, detail) => {
      const notice = status === 'closed' && detail?.code ? (CLOSE_NOTICES[detail.code] ?? null) : undefined;
      useGameStore.getState().setStatus(status, notice);
    },
  });
  active = socket;

  return () => {
    if (active === socket) disconnectRoom();
  };
}

export function disconnectRoom(): void {
  active?.dispose();
  active = null;
}

/** Odadan bilerek çıkış: sunucuya bildirir ve bağlantıyı kapatır. */
export function leaveRoom(): void {
  active?.send({ t: 'leave' });
  disconnectRoom();
  useGameStore.getState().reset();
}

export function sendAction(msg: ClientMessage): boolean {
  return active?.send(msg) ?? false;
}

export function sendBinary(channel: BinaryChannel, payload: ArrayBufferView): boolean {
  return active?.sendBinary(channel, payload) ?? false;
}

export function onBinary(channel: BinaryChannel, listener: (data: ArrayBuffer) => void): () => void {
  return active?.onBinary(channel, listener) ?? (() => {});
}

/** Çizim yeniden-senkron isteklerine abone ol (Anlatıcı tuvali). */
export function onDrawResync(listener: () => void): () => void {
  resyncListeners.add(listener);
  return () => resyncListeners.delete(listener);
}

/** Sunucu saatine göre şimdi (geri sayımlar bunu kullanır). */
export function serverNow(): number {
  return active?.serverNow() ?? Date.now();
}

// Sadece geliştirmede: tarayıcı testleri eylem gönderebilsin.
if (import.meta.env.DEV) (window as unknown as { __tabuSend: typeof sendAction }).__tabuSend = sendAction;
