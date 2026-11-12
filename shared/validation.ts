import { PLAYER_NAME_MAX_LENGTH, ROOM_CODE_PATTERN } from './constants';

/** Boşlukları sadeleştirir, kontrol karakterlerini atar, uzunluğu sınırlar. */
export function sanitizeName(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = input.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (cleaned.length === 0) return null;
  return cleaned.slice(0, PLAYER_NAME_MAX_LENGTH);
}

export function normalizeRoomCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const code = input.trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(code) ? code : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isPlayerId(input: unknown): input is string {
  return typeof input === 'string' && UUID_RE.test(input);
}
