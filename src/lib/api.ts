import { normalizeRoomCode } from '@shared/validation';

export async function createRoom(): Promise<string> {
  const res = await fetch('/api/rooms', { method: 'POST' });
  if (!res.ok) throw new Error('Oda oluşturulamadı.');
  const body = (await res.json()) as { code: string };
  return body.code;
}

export async function roomExists(code: string): Promise<boolean> {
  const normalized = normalizeRoomCode(code);
  if (!normalized) return false;
  const res = await fetch(`/api/rooms/${normalized}`);
  if (!res.ok) return false;
  const body = (await res.json()) as { exists: boolean };
  return body.exists;
}

export function roomSocketUrl(code: string): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/api/rooms/${code}/ws`;
}
