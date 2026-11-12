/**
 * Worker giriş noktası.
 *
 *   POST /api/rooms                -> yeni oda kodu üretir, Durable Object'i başlatır
 *   GET  /api/rooms/:code          -> oda var mı? (katılmadan önce kontrol)
 *   GET  /api/rooms/:code/ws       -> WebSocket upgrade, ilgili odanın Durable Object'ine yönlendirilir
 *   *                              -> statik SPA dosyaları (wrangler `assets`)
 *
 * Her oda kendi Durable Object örneğidir (idFromName(code)); odalar birbirinin
 * belleğini paylaşmaz, boşalan oda hibernation ile RAM'den düşer ve TTL alarmı
 * ile depolaması silinir.
 */
import { normalizeRoomCode } from '../shared/validation';
import type { Env } from './env';
import { generateRoomCode } from './roomCode';

export { RoomDurableObject } from './RoomDurableObject';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function createRoom(env: Env): Promise<Response> {
  // Çakışma ihtimali çok düşük; yine de birkaç kez dene.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    if (await stub.initialize(code)) return json({ code }, 201);
  }
  return json({ error: 'room_create_failed' }, 503);
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean); // ['api','rooms',code?,'ws'?]

    if (parts[0] !== 'api') return env.ASSETS.fetch(request);

    if (parts[1] === 'rooms') {
      if (parts.length === 2 && request.method === 'POST') return createRoom(env);

      const code = normalizeRoomCode(parts[2]);
      if (!code) return json({ error: 'bad_code' }, 400);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));

      if (parts.length === 3 && request.method === 'GET') {
        return json({ code, exists: await stub.exists() });
      }

      if (parts.length === 4 && parts[3] === 'ws') {
        if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
          return new Response('Expected WebSocket upgrade', { status: 426 });
        }
        return stub.fetch(request);
      }
    }

    if (parts[1] === 'health') return json({ ok: true });

    return json({ error: 'not_found' }, 404);
  },
} satisfies ExportedHandler<Env>;
