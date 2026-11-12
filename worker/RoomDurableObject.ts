/**
 * Oda başına bir Durable Object.
 *
 * Bellek prensipleri:
 *  - WebSocket Hibernation API kullanılır (`ctx.acceptWebSocket`). Odada mesaj trafiği
 *    yokken nesne RAM'den tahliye edilebilir; bağlantılar Cloudflare tarafından açık
 *    tutulur ve ilk mesajla nesne depolamadan yeniden kurulur.
 *  - Soket başına durum (playerId) `serializeAttachment` ile sokete iliştirilir;
 *    ayrı bir Map tutulmaz, dolayısıyla sızıntı yapacak referans da yoktur.
 *  - TTL: Alarm, son anlamlı etkileşimden 1 saat sonra tetiklenir; oda hâlâ
 *    hareketsizse tüm soketler kapatılır ve depolama tamamen silinir.
 *  - İkili akışlar (çizim/kukla) çözülmeden, sadece kanal baytına bakılarak aktarılır.
 */
import { DurableObject } from 'cloudflare:workers';
import { MAX_BINARY_MESSAGE_BYTES, MAX_JSON_MESSAGE_BYTES, ROOM_TTL_MS } from '../shared/constants';
import {
  parseClientMessage,
  BinaryChannel,
  readBinaryChannel,
  type ClientMessage,
  type ErrorCode,
  type ServerMessage,
} from '../shared/protocol';
import { isPlayerId, sanitizeName } from '../shared/validation';
import { CardDeck } from '../shared/words';
import type { Env } from './env';
import * as engine from './room/engine';
import {
  createRoomData,
  findPlayer,
  joinPlayer,
  markDisconnected,
  removePlayer,
  toSnapshot,
  type RoomData,
} from './room/RoomData';

interface SocketAttachment {
  playerId: string | null;
}

const STORAGE_KEY = 'room';

const devDisabled = (): engine.ActionResult => ({ ok: false, code: 'not_allowed', message: 'Geliştirici araçları kapalı.' });
const badMessage = (): engine.ActionResult => ({ ok: false, code: 'bad_message', message: 'Geçersiz mesaj.' });
/** lastActivity depolamaya en fazla bu sıklıkla yazılır (gereksiz yazma maliyetini önler). */
const ACTIVITY_PERSIST_INTERVAL_MS = 60_000;

/** Uygulamaya özel WebSocket kapanış kodları (4000-4999). */
const CloseCode = {
  Normal: 1000,
  RoomClosed: 4000,
  Replaced: 4001,
  RoomFull: 4002,
  BadHello: 4003,
  TooLarge: 4009,
} as const;

export class RoomDurableObject extends DurableObject<Env> {
  private room: RoomData | null = null;
  private lastActivityPersistedAt = 0;
  /** Kart destesi RAM'de tutulur (birkaç yüz bayt); hibernation sonrası yeniden karılır. */
  private deck = new CardDeck();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Hibernation sonrası uyanışta durumu tek okuma ile geri yükle.
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<RoomData>(STORAGE_KEY)) ?? null;
      this.lastActivityPersistedAt = this.room?.lastActivity ?? 0;
    });
  }

  // ---------------------------------------------------------------------------
  // RPC (Worker'dan çağrılır)
  // ---------------------------------------------------------------------------

  /** Odayı ilk kez oluşturur. Kod zaten kullanılıyorsa false döner. */
  async initialize(code: string): Promise<boolean> {
    if (this.room) return false;
    const now = Date.now();
    this.room = createRoomData(code, now);
    await this.persist();
    await this.rearm();
    return true;
  }

  async exists(): Promise<boolean> {
    return this.room !== null;
  }

  // ---------------------------------------------------------------------------
  // WebSocket kabulü
  // ---------------------------------------------------------------------------

  override async fetch(_request: Request): Promise<Response> {
    if (!this.room) {
      return new Response(JSON.stringify({ error: 'room_not_found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ playerId: null } satisfies SocketAttachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const room = this.room;
    if (!room) {
      this.safeClose(ws, CloseCode.RoomClosed, 'room_closed');
      return;
    }

    if (typeof message !== 'string') {
      this.relayBinary(ws, message);
      return;
    }

    if (message.length > MAX_JSON_MESSAGE_BYTES) {
      this.safeClose(ws, CloseCode.TooLarge, 'message_too_large');
      return;
    }

    const msg = parseClientMessage(message);
    if (!msg) {
      this.sendTo(ws, { t: 'error', code: 'bad_message', message: 'Geçersiz mesaj.' });
      return;
    }

    if (msg.t === 'ping') {
      // Ping TTL'i uzatmaz: unutulmuş açık bir sekme odayı sonsuza dek yaşatmasın.
      this.sendTo(ws, { t: 'pong', ts: msg.ts, serverTime: Date.now() });
      return;
    }

    if (msg.t === 'hello') {
      await this.handleHello(ws, room, msg);
      return;
    }

    const playerId = this.attachment(ws).playerId;
    if (!playerId || !findPlayer(room, playerId)) {
      this.sendTo(ws, { t: 'error', code: 'not_allowed', message: 'Önce odaya katılmalısın.' });
      return;
    }

    this.touch(room);
    await this.handleGameMessage(ws, room, playerId, msg);
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    await this.handleSocketGone(ws);
    this.safeClose(ws, code === 1005 ? CloseCode.Normal : code, reason);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.handleSocketGone(ws);
  }

  // ---------------------------------------------------------------------------
  // TTL
  // ---------------------------------------------------------------------------

  override async alarm(): Promise<void> {
    const room = this.room;
    if (!room) {
      await this.ctx.storage.deleteAll();
      return;
    }

    // 1) Sunucu otoriteli zamanlayıcı: çark bitişi, tur sonu, özet otomatik kapanışı.
    if (engine.onDeadline(room, this.engineCtx())) {
      await this.persist();
      this.pushAll();
    }

    // 2) TTL: hareketsiz oda tamamen silinir.
    if (Date.now() - room.lastActivity >= ROOM_TTL_MS) {
      for (const ws of this.ctx.getWebSockets()) this.safeClose(ws, CloseCode.RoomClosed, 'room_expired');
      this.room = null;
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      return;
    }
    await this.rearm();
  }

  /** Tek alarm yuvası: en yakın faz bitişi ile TTL bitişinden hangisi önceyse ona kurulur. */
  private async rearm(): Promise<void> {
    const room = this.room;
    if (!room) return;
    const ttlAt = room.lastActivity + ROOM_TTL_MS;
    const next = room.phaseDeadline !== null ? Math.min(room.phaseDeadline, ttlAt) : ttlAt;
    await this.ctx.storage.setAlarm(Math.max(next, Date.now() + 1));
  }

  private engineCtx(): engine.EngineCtx {
    return { now: Date.now(), deck: this.deck, rand: Math.random };
  }

  // ---------------------------------------------------------------------------
  // Mesaj işleyiciler
  // ---------------------------------------------------------------------------

  private async handleHello(ws: WebSocket, room: RoomData, msg: Extract<ClientMessage, { t: 'hello' }>): Promise<void> {
    const name = sanitizeName(msg.name);
    if (!isPlayerId(msg.playerId) || !name) {
      this.sendError(ws, 'bad_name', 'Geçerli bir isim gir.');
      this.safeClose(ws, CloseCode.BadHello, 'bad_hello');
      return;
    }

    const result = joinPlayer(room, msg.playerId, name, Date.now());
    if (!result.ok) {
      this.sendError(ws, 'room_full', 'Oda dolu.');
      this.safeClose(ws, CloseCode.RoomFull, 'room_full');
      return;
    }

    // Aynı oyuncu ikinci sekmeden bağlandıysa eski soketi kapat (tek oturum).
    for (const other of this.ctx.getWebSockets()) {
      if (other !== ws && this.attachment(other).playerId === msg.playerId) {
        other.serializeAttachment({ playerId: null } satisfies SocketAttachment);
        this.safeClose(other, CloseCode.Replaced, 'replaced');
      }
    }

    ws.serializeAttachment({ playerId: msg.playerId } satisfies SocketAttachment);
    room.lastActivity = this.lastActivityPersistedAt = Date.now();
    await this.persist();

    this.sendTo(ws, { t: 'welcome', you: msg.playerId, serverTime: Date.now(), snapshot: toSnapshot(room) });
    this.sendPrivateTo(ws, room, msg.playerId);
    this.broadcastState(ws);
    await this.rearm();
  }

  private async handleGameMessage(
    ws: WebSocket,
    room: RoomData,
    playerId: string,
    msg: Exclude<ClientMessage, { t: 'hello' } | { t: 'ping' }>,
  ): Promise<void> {
    const ctx = this.engineCtx();
    let result: engine.ActionResult;

    switch (msg.t) {
      case 'leave': {
        ws.serializeAttachment({ playerId: null } satisfies SocketAttachment);
        removePlayer(room, playerId);
        engine.onRosterChanged(room, ctx);
        await this.commit();
        this.safeClose(ws, CloseCode.Normal, 'left');
        return;
      }
      case 'lobby:setTeam':
        result = engine.setTeam(room, playerId, msg.team);
        break;
      case 'lobby:setReady':
        result = typeof msg.ready === 'boolean' ? engine.setReady(room, playerId, msg.ready, ctx) : badMessage();
        break;
      case 'round:start':
        result = engine.startRound(room, playerId, ctx);
        break;
      case 'round:correct':
        result = engine.markCorrect(room, playerId, msg.index, ctx);
        break;
      case 'round:forbidden':
        result = engine.markForbidden(room, playerId, msg.index, ctx);
        break;
      case 'round:clueUsed':
        result = engine.useClue(room, playerId, ctx);
        break;
      case 'round:pass':
        result = engine.pass(room, playerId, ctx);
        break;
      case 'summary:continue':
        result = engine.continueFromSummary(room, playerId, ctx);
        break;
      case 'draw:resync':
        this.forwardResync(room, playerId);
        return;
      case 'dev:setBoard':
        result = this.env.DEV_TOOLS === '1' ? engine.devSetBoard(room, msg.a, msg.b, ctx) : devDisabled();
        break;
    }

    if (!result.ok) {
      this.sendError(ws, result.code, result.message);
      // Reddedilen eylem bile turu bitirmiş olabilir (süre dolması): durumu yine de yay.
      await this.commit();
      return;
    }
    await this.commit();
  }

  /** Durumu kaydet, herkese yay, alarmı yeniden kur. */
  private async commit(): Promise<void> {
    await this.persist();
    this.pushAll();
    await this.rearm();
  }

  private async handleSocketGone(ws: WebSocket): Promise<void> {
    const room = this.room;
    const playerId = this.attachment(ws).playerId;
    if (!room || !playerId) return;
    ws.serializeAttachment({ playerId: null } satisfies SocketAttachment);
    markDisconnected(room, playerId);
    engine.onRosterChanged(room, this.engineCtx());
    await this.commit();
  }

  /**
   * Yüksek frekanslı ikili akış: yalnızca aktif turdaki Anlatıcı gönderebilir. Yük çözülmez
   * ve sunucuda SAKLANMAZ; aynı ArrayBuffer ilgili oyunculara iletilir (sunucu belleği sabit).
   *  - Çizim kanalı yalnızca Çizme modunda ve yalnızca Dinleyicilere gider (Gözlemci sadece kartı görür).
   *  - Kukla kanalı yalnızca Kukla modunda ve Anlatıcı dışındaki herkese gider.
   */
  private relayBinary(ws: WebSocket, data: ArrayBuffer): void {
    const room = this.room;
    const channel = room ? readBinaryChannel(data) : null;
    if (!room || channel === null || data.byteLength > MAX_BINARY_MESSAGE_BYTES) return;
    const sender = this.attachment(ws).playerId;
    const round = room.round;
    if (!sender || room.phase !== 'round' || !round || round.narratorId !== sender) return;
    if (channel === BinaryChannel.Draw && round.mode !== 'cizme') return;
    if (channel === BinaryChannel.Puppet && round.mode !== 'kukla') return;

    for (const other of this.ctx.getWebSockets()) {
      if (other === ws) continue;
      const id = this.attachment(other).playerId;
      if (!id) continue;
      if (channel === BinaryChannel.Draw && id === round.observerId) continue;
      try {
        other.send(data);
      } catch {
        /* kapanmakta olan soket: close handler temizler */
      }
    }
  }

  /** Dinleyici çizimi yeniden istedi: Anlatıcı'nın soketine ilet. */
  private forwardResync(room: RoomData, requesterId: string): void {
    const r = room.round;
    if (room.phase !== 'round' || !r || r.mode !== 'cizme' || r.narratorId === requesterId) return;
    for (const ws of this.ctx.getWebSockets()) {
      if (this.attachment(ws).playerId === r.narratorId) this.sendTo(ws, { t: 'draw:resync' });
    }
  }

  // ---------------------------------------------------------------------------
  // Yardımcılar
  // ---------------------------------------------------------------------------

  private attachment(ws: WebSocket): SocketAttachment {
    return (ws.deserializeAttachment() as SocketAttachment | null) ?? { playerId: null };
  }

  /** Anlamlı etkileşim zamanını günceller; depolamaya seyrek yazar. */
  private touch(room: RoomData): void {
    room.lastActivity = Date.now();
    if (room.lastActivity - this.lastActivityPersistedAt > ACTIVITY_PERSIST_INTERVAL_MS) {
      this.lastActivityPersistedAt = room.lastActivity;
      void this.persist();
    }
  }

  private async persist(): Promise<void> {
    if (this.room) await this.ctx.storage.put(STORAGE_KEY, this.room);
  }

  private sendTo(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* soket kapanıyor */
    }
  }

  private sendError(ws: WebSocket, code: ErrorCode, message: string): void {
    this.sendTo(ws, { t: 'error', code, message });
  }

  /** Herkese genel durum, Anlatıcı ve Gözlemci'ye ayrıca özel kart verisi. */
  private pushAll(): void {
    const room = this.room;
    if (!room) return;
    this.broadcastState();
    for (const ws of this.ctx.getWebSockets()) {
      const id = this.attachment(ws).playerId;
      if (id) this.sendPrivateTo(ws, room, id);
    }
  }

  /** Kart yalnızca turdaki Anlatıcı ve Gözlemci'ye gider; Dinleyiciler hiç almaz. */
  private sendPrivateTo(ws: WebSocket, room: RoomData, playerId: string): void {
    const r = room.round;
    const isActor = !!r && (r.narratorId === playerId || r.observerId === playerId);
    if (!isActor) return;
    this.sendTo(ws, { t: 'private', data: { card: room.phase === 'round' ? room.roundCard : null } });
  }

  /** Durum anlık görüntüsü bir kez serileştirilir, tüm kimliği belli soketlere gönderilir. */
  private broadcastState(except?: WebSocket): void {
    if (!this.room) return;
    const payload = JSON.stringify({ t: 'state', snapshot: toSnapshot(this.room) } satisfies ServerMessage);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except || !this.attachment(ws).playerId) continue;
      try {
        ws.send(payload);
      } catch {
        /* soket kapanıyor */
      }
    }
  }

  private safeClose(ws: WebSocket, code: number, reason: string): void {
    try {
      ws.close(code, reason);
    } catch {
      /* zaten kapalı */
    }
  }
}
