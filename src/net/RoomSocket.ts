/**
 * Tek bir odaya bağlı WebSocket istemcisi.
 *
 *  - Otomatik yeniden bağlanma (üstel geri çekilme + jitter), sayfa görünür
 *    olduğunda ve ağ geri geldiğinde anında deneme.
 *  - Ping/pong ile sunucu saat farkı (clock offset) hesaplanır; geri sayımlar
 *    sunucu saatine göre gösterilir, böylece tüm cihazlar aynı süreyi görür.
 *  - İkili kanallar için abonelik API'si (çizim/kukla): `onBinary(channel, fn)`.
 *  - `dispose()` tüm zamanlayıcıları, dinleyicileri ve soketi kapatır;
 *    sonrasında nesne hiçbir şey tutmaz (GC'ye hazır).
 */
import { PING_INTERVAL_MS } from '@shared/constants';
import {
  encodeBinary,
  parseServerMessage,
  readBinaryChannel,
  type BinaryChannel,
  type ClientMessage,
  type ServerMessage,
} from '@shared/protocol';

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface RoomSocketHandlers {
  onMessage(msg: ServerMessage): void;
  onStatus(status: ConnectionStatus, detail?: { code?: number; reason?: string }): void;
  /** Bağlantı (yeniden) açıldığında gönderilecek ilk mesaj (hello). */
  onOpen(socket: RoomSocket): void;
  onClockOffset?(offsetMs: number, rttMs: number): void;
}

/** Bu kodlarla kapanınca yeniden bağlanılmaz (oda yok, dolu, başka sekme devraldı...). */
const TERMINAL_CLOSE_CODES = new Set([1000, 4000, 4001, 4002, 4003]);
const MAX_BACKOFF_MS = 5_000;

type BinaryListener = (data: ArrayBuffer) => void;

export class RoomSocket {
  private ws: WebSocket | null = null;
  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  private readonly binaryListeners = new Map<BinaryChannel, Set<BinaryListener>>();
  /** EWMA ile yumuşatılmış saat farkı (sunucu - istemci). */
  private clockOffset = 0;
  private hasClockSample = false;

  constructor(
    private readonly url: string,
    private readonly handlers: RoomSocketHandlers,
  ) {
    window.addEventListener('online', this.handleWake);
    document.addEventListener('visibilitychange', this.handleWake);
    this.connect();
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** Sunucu saatine göre şimdiki zaman (epoch ms). */
  serverNow(): number {
    return Date.now() + this.clockOffset;
  }

  send(msg: ClientMessage): boolean {
    if (!this.isOpen) return false;
    this.ws!.send(JSON.stringify(msg));
    return true;
  }

  /** İkili akış gönderimi. Tampon doluysa (yavaş ağ) kare atlanır; kuyruk birikmez. */
  sendBinary(channel: BinaryChannel, payload: ArrayBufferView, maxBufferedBytes = 64 * 1024): boolean {
    if (!this.isOpen || this.ws!.bufferedAmount > maxBufferedBytes) return false;
    this.ws!.send(encodeBinary(channel, payload));
    return true;
  }

  onBinary(channel: BinaryChannel, listener: BinaryListener): () => void {
    let set = this.binaryListeners.get(channel);
    if (!set) this.binaryListeners.set(channel, (set = new Set()));
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.binaryListeners.delete(channel);
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('online', this.handleWake);
    document.removeEventListener('visibilitychange', this.handleWake);
    this.clearTimers();
    this.binaryListeners.clear();
    this.teardownSocket(1000, 'client_dispose');
  }

  // ---------------------------------------------------------------------------

  private connect(): void {
    if (this.disposed) return;
    this.handlers.onStatus(this.attempts === 0 ? 'connecting' : 'reconnecting');
    const ws = new WebSocket(this.url);
    ws.binaryType = 'arraybuffer';
    ws.onopen = this.handleOpen;
    ws.onmessage = this.handleMessage;
    ws.onclose = this.handleClose;
    ws.onerror = null; // hata her zaman ardından close üretir
    this.ws = ws;
  }

  private readonly handleOpen = () => {
    this.attempts = 0;
    this.handlers.onStatus('open');
    this.handlers.onOpen(this);
    this.sendPing();
    this.pingTimer = setInterval(this.sendPing, PING_INTERVAL_MS);
  };

  private readonly handleMessage = (ev: MessageEvent) => {
    const data: unknown = ev.data;
    if (typeof data !== 'string') {
      if (data instanceof ArrayBuffer) this.dispatchBinary(data);
      return;
    }
    const msg = parseServerMessage(data);
    if (!msg) return;
    if (msg.t === 'pong') {
      this.updateClock(msg.ts, msg.serverTime);
      return;
    }
    if (msg.t === 'welcome') this.updateClock(Date.now(), msg.serverTime);
    this.handlers.onMessage(msg);
  };

  private readonly handleClose = (ev: CloseEvent) => {
    this.clearTimers();
    this.detachSocket();
    if (this.disposed) return;
    if (TERMINAL_CLOSE_CODES.has(ev.code)) {
      this.handlers.onStatus('closed', { code: ev.code, reason: ev.reason });
      return;
    }
    this.scheduleReconnect();
  };

  private readonly handleWake = () => {
    if (this.disposed || document.visibilityState === 'hidden') return;
    // Bekleyen bir yeniden bağlanma varsa beklemeden dene.
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      this.connect();
    }
  };

  private readonly sendPing = () => {
    this.send({ t: 'ping', ts: Date.now() });
  };

  private scheduleReconnect(): void {
    this.handlers.onStatus('reconnecting');
    const base = Math.min(MAX_BACKOFF_MS, 250 * 2 ** this.attempts++);
    const delay = base / 2 + Math.random() * (base / 2);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private updateClock(sentAt: number, serverTime: number): void {
    const now = Date.now();
    const rtt = Math.max(0, now - sentAt);
    const sample = serverTime + rtt / 2 - now;
    this.clockOffset = this.hasClockSample ? this.clockOffset * 0.7 + sample * 0.3 : sample;
    this.hasClockSample = true;
    this.handlers.onClockOffset?.(this.clockOffset, rtt);
  }

  private dispatchBinary(buffer: ArrayBuffer): void {
    const channel = readBinaryChannel(buffer);
    if (channel === null) return;
    const listeners = this.binaryListeners.get(channel);
    if (!listeners) return;
    for (const l of listeners) l(buffer);
  }

  private clearTimers(): void {
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.pingTimer = null;
    this.reconnectTimer = null;
  }

  private detachSocket(): void {
    const ws = this.ws;
    if (!ws) return;
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
    this.ws = null;
  }

  private teardownSocket(code: number, reason: string): void {
    const ws = this.ws;
    this.detachSocket();
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      try {
        ws.close(code, reason);
      } catch {
        /* yoksay */
      }
    }
  }
}
