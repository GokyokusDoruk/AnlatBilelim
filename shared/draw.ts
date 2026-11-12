/**
 * Çizim akışı kodlaması (Çizme modu).
 *
 * Görüntü (base64/blob) ASLA gönderilmez. Yalnızca normalize edilmiş koordinatlar ve
 * fırça/silgi komutları, 16 bitlik sözcüklerden oluşan ikili çerçevelerle akar:
 *
 *   koordinat sözcüğü : 0x0000..0x7FFF  (0..1 aralığı, 15 bit çözünürlük)
 *   komut sözcüğü     : 0x8000 | kod    (yüksek bit 1)
 *
 *   BEGIN style x y   : yeni çizgi başlar (style: renk, silgi, kalınlık)
 *   x y x y ...       : çizgiye devam eden noktalar
 *   END               : çizgi biter
 *   CLEAR             : tuvali temizle
 *   UNDO              : son çizgiyi geri al
 *
 * Çerçeveler çizgilerin ortasında bölünebilir; ayrıştırıcı durumu çerçeveler arasında taşır.
 * Bir kare ~ nokta başına 4 bayttır: 90 sn'lik yoğun çizim bile birkaç yüz KB'ı geçmez.
 */
import { BinaryChannel, BINARY_HEADER_BYTES, encodeBinary } from './protocol';

export const COORD_MAX = 0x7fff;

export const DrawOp = {
  Begin: 0x8001,
  End: 0x8002,
  Clear: 0x8003,
  Undo: 0x8004,
} as const;

/** Kalem renkleri (indeks akışta taşınır). */
export const DRAW_COLORS = ['#141414', '#e53935', '#1e88e5', '#43a047', '#fdd835', '#fb8c00', '#8e24aa', '#6d4c41'] as const;
/** Çizgi kalınlığı, tuval kenarının oranı olarak: her cihazda orantılı görünür. */
export const DRAW_WIDTHS = [0.006, 0.012, 0.024, 0.045] as const;
/** Silgi, seçili kalınlığın bu katıdır. */
export const ERASER_SCALE = 3;

export interface StrokeStyle {
  color: number; // 0..7
  width: number; // 0..3
  eraser: boolean;
}

export function packStyle(s: StrokeStyle): number {
  return (s.color & 0x7) | ((s.eraser ? 1 : 0) << 3) | ((s.width & 0x3) << 4);
}

export function unpackStyle(w: number): StrokeStyle {
  return { color: w & 0x7, eraser: ((w >> 3) & 1) === 1, width: (w >> 4) & 0x3 };
}

export const toCoord = (v: number): number => Math.max(0, Math.min(COORD_MAX, Math.round(v * COORD_MAX)));
export const fromCoord = (c: number): number => c / COORD_MAX;

/** Güvenlik sınırları: bozuk ya da kötü niyetli akış belleği şişirmesin. */
export const MAX_STROKES = 500;
export const MAX_POINTS = 60_000;

export interface DrawHandlers {
  begin(style: StrokeStyle, x: number, y: number): void;
  point(x: number, y: number): void;
  end(): void;
  clear(): void;
  undo(): void;
}

const enum S {
  Idle,
  Style,
  BeginX,
  BeginY,
  PointX,
  PointY,
}

/** Çerçeveler arası durum taşıyan akış ayrıştırıcısı. */
export class DrawParser {
  private state: S = S.Idle;
  private style = 0;
  private x = 0;

  push(words: ArrayLike<number>, h: DrawHandlers): void {
    for (let i = 0; i < words.length; i++) {
      const w = words[i]!;
      if ((w & 0x8000) !== 0) {
        switch (w) {
          case DrawOp.Begin:
            this.state = S.Style;
            break;
          case DrawOp.End:
            h.end();
            this.state = S.Idle;
            break;
          case DrawOp.Clear:
            h.clear();
            this.state = S.Idle;
            break;
          case DrawOp.Undo:
            h.undo();
            this.state = S.Idle;
            break;
          default:
            this.state = S.Idle; // bilinmeyen komut: akışı sıfırla
        }
        continue;
      }
      switch (this.state) {
        case S.Style:
          this.style = w;
          this.state = S.BeginX;
          break;
        case S.BeginX:
          this.x = w;
          this.state = S.BeginY;
          break;
        case S.BeginY:
          h.begin(unpackStyle(this.style), this.x, w);
          this.state = S.PointX;
          break;
        case S.PointX:
          this.x = w;
          this.state = S.PointY;
          break;
        case S.PointY:
          h.point(this.x, w);
          this.state = S.PointX;
          break;
        default:
          break; // çizgi dışı koordinat: yoksay
      }
    }
  }

  reset(): void {
    this.state = S.Idle;
  }
}

/** Anlatıcı tarafı: sözcükleri biriktirir, kare olarak gönderilmeyi bekler. */
export class DrawEncoder {
  private words: number[] = [];

  begin(style: StrokeStyle, x: number, y: number): void {
    this.words.push(DrawOp.Begin, packStyle(style), x, y);
  }
  point(x: number, y: number): void {
    this.words.push(x, y);
  }
  end(): void {
    this.words.push(DrawOp.End);
  }
  clear(): void {
    this.words.push(DrawOp.Clear);
  }
  undo(): void {
    this.words.push(DrawOp.Undo);
  }

  get pending(): number {
    return this.words.length;
  }

  /**
   * En fazla `maxWords` sözcüklük kare üretir; gönderim başarılı olunca `consume(count)` çağrılır.
   * `frame` başlıklı tam çerçeve, `payload` yalnızca sözcüklerdir (RoomSocket.sendBinary başlığı kendisi ekler).
   */
  peek(maxWords = 1500): { frame: ArrayBuffer; payload: Uint16Array; count: number } | null {
    if (this.words.length === 0) return null;
    const count = Math.min(maxWords, this.words.length);
    const frame = encodeDrawFrame(this.words.slice(0, count));
    return { frame, payload: new Uint16Array(frame, BINARY_HEADER_BYTES), count };
  }

  /** Bekleyen her şeyi atıp yerine `words` koyar (yeniden senkron: anlık görüntü). */
  replacePending(words: number[]): void {
    this.words = words;
  }

  consume(count: number): void {
    this.words.splice(0, count);
  }

  clearPending(): void {
    this.words.length = 0;
  }
}

export function encodeDrawFrame(words: ArrayLike<number>): ArrayBuffer {
  return encodeBinary(BinaryChannel.Draw, Uint16Array.from(words as ArrayLike<number>));
}

/** Çerçevenin yükünü Uint16 görünümü olarak döndürür (kopyasız). */
export function decodeDrawFrame(buffer: ArrayBuffer): Uint16Array | null {
  const bytes = buffer.byteLength - BINARY_HEADER_BYTES;
  if (bytes <= 0 || bytes % 2 !== 0) return null;
  return new Uint16Array(buffer, BINARY_HEADER_BYTES, bytes / 2);
}

export interface Stroke {
  style: StrokeStyle;
  /** [x0, y0, x1, y1, ...] koordinat sözcükleri. */
  pts: number[];
}

/** Çizgi listesi: geri al ve yeniden çizim için gerçeğin kaynağı (istemci belleğinde). */
export class StrokeStore {
  strokes: Stroke[] = [];
  private current: Stroke | null = null;
  private points = 0;

  get canDraw(): boolean {
    return this.strokes.length < MAX_STROKES && this.points < MAX_POINTS;
  }

  begin(style: StrokeStyle, x: number, y: number): Stroke | null {
    if (!this.canDraw) {
      this.current = null;
      return null;
    }
    this.current = { style, pts: [x, y] };
    this.strokes.push(this.current);
    this.points++;
    return this.current;
  }

  point(x: number, y: number): Stroke | null {
    const c = this.current;
    if (!c || this.points >= MAX_POINTS) return null;
    c.pts.push(x, y);
    this.points++;
    return c;
  }

  end(): void {
    this.current = null;
  }

  clear(): void {
    this.strokes = [];
    this.current = null;
    this.points = 0;
  }

  undo(): void {
    const s = this.strokes.pop();
    if (s) this.points -= s.pts.length / 2;
    this.current = null;
  }

  get pointCount(): number {
    return this.points;
  }

  /**
   * Tüm çizimi komut akışına çevirir (yeni katılana / yeniden senkron için).
   * `openLast`: çizim sürüyorsa son çizgi açık bırakılır, sonraki canlı noktalar ona eklenir.
   */
  snapshotWords(openLast = false): number[] {
    const out: number[] = [DrawOp.Clear];
    this.strokes.forEach((s, i) => {
      out.push(DrawOp.Begin, packStyle(s.style), s.pts[0]!, s.pts[1]!);
      for (let j = 2; j < s.pts.length; j++) out.push(s.pts[j]!);
      if (!(openLast && i === this.strokes.length - 1)) out.push(DrawOp.End);
    });
    return out;
  }
}
