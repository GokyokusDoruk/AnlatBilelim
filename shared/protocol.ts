/**
 * WebSocket protokolü.
 *
 * - Kontrol mesajları (lobi, tur, skor): küçük JSON nesneleri, `t` alanı ile ayırt edilir.
 * - Yüksek frekanslı akışlar (çizim noktaları, kukla eklem pozisyonları): ikili (binary)
 *   çerçeveler. İlk bayt kanal kimliğidir; sunucu yükü çözmeden (parse etmeden) diğer
 *   oyunculara aktarır. Bu sayede Durable Object CPU/bellek kullanımı minimumda kalır.
 */
import type { GameMode, RoomSnapshot, RoundPrivateState, TeamId } from './types';

// ---------------------------------------------------------------------------
// İstemci -> Sunucu
// ---------------------------------------------------------------------------

export type ClientMessage =
  | { t: 'hello'; playerId: string; name: string }
  | { t: 'ping'; ts: number }
  | { t: 'leave' }
  // Lobi (Task 3)
  | { t: 'lobby:setTeam'; team: TeamId }
  | { t: 'lobby:setReady'; ready: boolean }
  // Tur (Task 3-7)
  | { t: 'round:start' } // Gözlemci "Tur Başlat"
  | { t: 'round:correct'; index?: number } // Anlatma: +1 / Üçlü kart: index'teki kelimeye tik
  | { t: 'round:forbidden' } // Anlatma: -1
  | { t: 'round:clueUsed' } // 15 Kelime: -1 ipucu
  | { t: 'round:pass' }
  | { t: 'summary:continue' }
  /** Dinleyici çizimi baştan ister (geç katılma / yeniden bağlanma); sunucu Anlatıcı'ya iletir. */
  | { t: 'draw:resync' }
  /** Yalnızca sunucuda DEV_TOOLS=1 iken çalışır (yerel geliştirme / test). */
  | { t: 'dev:setBoard'; a: number; b: number };

export type ClientMessageType = ClientMessage['t'];

// ---------------------------------------------------------------------------
// Sunucu -> İstemci
// ---------------------------------------------------------------------------

export type ErrorCode =
  | 'room_not_found'
  | 'room_full'
  | 'bad_message'
  | 'bad_name'
  | 'not_allowed'
  | 'not_implemented';

export type ServerMessage =
  | { t: 'welcome'; you: string; serverTime: number; snapshot: RoomSnapshot }
  | { t: 'state'; snapshot: RoomSnapshot }
  /** Rol bazlı özel veri: yalnızca Anlatıcı ve Gözlemci alır. */
  | { t: 'private'; data: RoundPrivateState }
  | { t: 'pong'; ts: number; serverTime: number }
  | { t: 'roulette'; result: GameMode; startedAt: number; seed: number }
  /** Yalnızca Anlatıcı'ya: çizimin tamamını yeniden yayınla. */
  | { t: 'draw:resync' }
  | { t: 'error'; code: ErrorCode; message: string };

export type ServerMessageType = ServerMessage['t'];

// ---------------------------------------------------------------------------
// İkili akış kanalları
// ---------------------------------------------------------------------------

export const BinaryChannel = {
  /** Çizim komutları (Task 6): normalize [x,y] 0..1 -> Uint16 (0..65535). */
  Draw: 1,
  /** Kukla eklem dönüşümleri (Task 7): Float32 [x,y,z,qx,qy,qz,qw] x eklem sayısı + kamera. */
  Puppet: 2,
} as const;
export type BinaryChannel = (typeof BinaryChannel)[keyof typeof BinaryChannel];

const BINARY_CHANNELS: ReadonlySet<number> = new Set(Object.values(BinaryChannel));

export function isBinaryChannel(value: number): value is BinaryChannel {
  return BINARY_CHANNELS.has(value);
}

/** 1 bayt kanal başlığı + yük. Yük 4 bayt hizalı tutulur ki Float32Array kopyasız okunsun. */
export const BINARY_HEADER_BYTES = 4;

export function encodeBinary(channel: BinaryChannel, payload: ArrayBufferView): ArrayBuffer {
  const out = new Uint8Array(BINARY_HEADER_BYTES + payload.byteLength);
  out[0] = channel;
  out.set(new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength), BINARY_HEADER_BYTES);
  return out.buffer;
}

export function readBinaryChannel(buffer: ArrayBuffer): BinaryChannel | null {
  if (buffer.byteLength < BINARY_HEADER_BYTES) return null;
  const ch = new Uint8Array(buffer, 0, 1)[0]!;
  return isBinaryChannel(ch) ? ch : null;
}

/** Yükü kopyalamadan görünüm olarak döndürür. */
export function binaryPayload(buffer: ArrayBuffer): DataView {
  return new DataView(buffer, BINARY_HEADER_BYTES);
}

// ---------------------------------------------------------------------------
// JSON yardımcıları
// ---------------------------------------------------------------------------

const CLIENT_TYPES: ReadonlySet<string> = new Set<ClientMessageType>([
  'hello',
  'ping',
  'leave',
  'lobby:setTeam',
  'lobby:setReady',
  'round:start',
  'round:correct',
  'round:forbidden',
  'round:clueUsed',
  'round:pass',
  'summary:continue',
  'draw:resync',
  'dev:setBoard',
]);

/** Sunucu tarafında kaba doğrulama; alan bazlı doğrulama ilgili handler'da yapılır. */
export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const msg: unknown = JSON.parse(raw);
    if (typeof msg !== 'object' || msg === null) return null;
    const t = (msg as { t?: unknown }).t;
    if (typeof t !== 'string' || !CLIENT_TYPES.has(t)) return null;
    return msg as ClientMessage;
  } catch {
    return null;
  }
}

export function parseServerMessage(raw: string): ServerMessage | null {
  try {
    const msg: unknown = JSON.parse(raw);
    if (typeof msg !== 'object' || msg === null || typeof (msg as { t?: unknown }).t !== 'string') return null;
    return msg as ServerMessage;
  } catch {
    return null;
  }
}
