/**
 * Oyun genelinde paylaşılan sabitler. Hem istemci hem Worker bu dosyayı kullanır;
 * kural değişiklikleri tek yerden yapılır.
 */

export const BOARD_SIZE = 45;

/** Oda kodu: karıştırılması kolay karakterler (0/O, 1/I/L) çıkarılmıştır. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 5;
export const ROOM_CODE_PATTERN = /^[A-HJKMNP-Z2-9]{4,6}$/;

/** Oda bu kadar süre hareketsiz kalırsa Durable Object depolaması silinir. */
export const ROOM_TTL_MS = 60 * 60 * 1000;

export const MAX_PLAYERS_PER_ROOM = 16;
export const MIN_PLAYERS_PER_TEAM = 2;
export const PLAYER_NAME_MAX_LENGTH = 16;

/** Ağ limitleri: kötü niyetli/bozuk istemcilerin belleği şişirmesini engeller. */
export const MAX_JSON_MESSAGE_BYTES = 2 * 1024;
export const MAX_BINARY_MESSAGE_BYTES = 8 * 1024;

/** İstemci ping aralığı (saat senkronu + bağlantı canlılığı). */
export const PING_INTERVAL_MS = 10_000;

/** Kukla senkron hızı (Task 7) ve çizim paket aralığı (Task 6). */
export const PUPPET_SYNC_FPS = 30;
export const DRAW_FLUSH_INTERVAL_MS = 33;
