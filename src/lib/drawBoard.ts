/**
 * Çizim tuvali: `StrokeStore` (gerçek kaynak) + Canvas 2D oluşturma.
 *
 * Hem Anlatıcı (yerel çizim) hem Dinleyici (ağdan gelen komutlar) aynı sınıfı kullanır, böylece
 * iki taraf birebir aynı görüntüyü üretir. rAF döngüsü YOKTUR: çizgi parçaları geldikleri anda
 * canvas'a eklenir, tarayıcı bir sonraki ekran yenilemesinde gösterir. Boştayken CPU harcanmaz.
 */
import {
  DRAW_COLORS,
  DRAW_WIDTHS,
  ERASER_SCALE,
  DrawParser,
  StrokeStore,
  decodeDrawFrame,
  fromCoord,
  type DrawHandlers,
  type Stroke,
  type StrokeStyle,
} from '@shared/draw';

const MAX_DPR = 2;
const BACKGROUND = '#ffffff';

export class DrawBoard implements DrawHandlers {
  readonly store = new StrokeStore();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly parser = new DrawParser();
  private side = 0;
  private dpr = 1;
  /** Aktif çizginin son iki noktası (px): orta nokta yumuşatması için. */
  private last: { x: number; y: number } | null = null;
  private mid: { x: number; y: number } | null = null;
  private disposed = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { desynchronized: true });
    if (!ctx) throw new Error('Canvas 2D desteklenmiyor');
    this.ctx = ctx;
  }

  /** CSS piksel cinsinden kare kenar; tüm çizim yeniden çizilir. */
  resize(side: number): void {
    if (this.disposed) return;
    const s = Math.max(1, Math.floor(side));
    this.dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    this.side = s;
    this.canvas.width = Math.round(s * this.dpr);
    this.canvas.height = Math.round(s * this.dpr);
    this.canvas.style.width = `${s}px`;
    this.canvas.style.height = `${s}px`;
    this.redrawAll();
  }

  /** Ağdan gelen ikili çerçeveyi uygula. */
  applyFrame(buffer: ArrayBuffer): void {
    const words = decodeDrawFrame(buffer);
    if (words) this.parser.push(words, this);
  }

  applyWords(words: ArrayLike<number>): void {
    this.parser.push(words, this);
  }

  // ---- DrawHandlers (hem yerel hem uzak çizim buradan geçer) ----

  begin(style: StrokeStyle, x: number, y: number): void {
    const stroke = this.store.begin(style, x, y);
    if (!stroke) return;
    const px = this.toPx(x, y);
    this.last = px;
    this.mid = px;
    this.dot(stroke.style, px);
  }

  point(x: number, y: number): void {
    const stroke = this.store.point(x, y);
    if (!stroke || !this.last || !this.mid) return;
    const p = this.toPx(x, y);
    const nextMid = { x: (this.last.x + p.x) / 2, y: (this.last.y + p.y) / 2 };
    this.applyStyle(stroke.style);
    this.ctx.beginPath();
    this.ctx.moveTo(this.mid.x, this.mid.y);
    this.ctx.quadraticCurveTo(this.last.x, this.last.y, nextMid.x, nextMid.y);
    this.ctx.stroke();
    this.mid = nextMid;
    this.last = p;
  }

  end(): void {
    // Son yarım parçayı gerçek son noktaya tamamla.
    const strokes = this.store.strokes;
    const s = strokes[strokes.length - 1];
    if (s && this.last && this.mid) {
      this.applyStyle(s.style);
      this.ctx.beginPath();
      this.ctx.moveTo(this.mid.x, this.mid.y);
      this.ctx.lineTo(this.last.x, this.last.y);
      this.ctx.stroke();
    }
    this.store.end();
    this.last = this.mid = null;
  }

  clear(): void {
    this.store.clear();
    this.last = this.mid = null;
    this.fillBackground();
  }

  undo(): void {
    this.store.undo();
    this.last = this.mid = null;
    this.redrawAll();
  }

  /** Yerel çizim yardımcıları: normalize [0,1] değer alır. */
  get canDraw(): boolean {
    return this.store.canDraw;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.store.clear();
    this.parser.reset();
    // Canvas'ın piksel belleğini hemen bırak.
    this.canvas.width = 0;
    this.canvas.height = 0;
  }

  // ---------------------------------------------------------------------------

  private toPx(x: number, y: number): { x: number; y: number } {
    return { x: fromCoord(x) * this.side, y: fromCoord(y) * this.side };
  }

  private applyStyle(style: StrokeStyle): void {
    const ctx = this.ctx;
    ctx.strokeStyle = style.eraser ? BACKGROUND : DRAW_COLORS[style.color]!;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = this.widthPx(style);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  private widthPx(style: StrokeStyle): number {
    return DRAW_WIDTHS[style.width]! * this.side * (style.eraser ? ERASER_SCALE : 1);
  }

  private dot(style: StrokeStyle, p: { x: number; y: number }): void {
    this.applyStyle(style);
    this.ctx.beginPath();
    this.ctx.arc(p.x, p.y, this.widthPx(style) / 2, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private fillBackground(): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, this.side, this.side);
  }

  private redrawAll(): void {
    this.fillBackground();
    for (const s of this.store.strokes) this.drawStroke(s);
  }

  private drawStroke(s: Stroke): void {
    const pts = s.pts;
    if (pts.length < 2) return;
    let prev = this.toPx(pts[0]!, pts[1]!);
    this.dot(s.style, prev);
    if (pts.length === 2) return;
    this.applyStyle(s.style);
    let mid = prev;
    this.ctx.beginPath();
    this.ctx.moveTo(mid.x, mid.y);
    for (let i = 2; i < pts.length; i += 2) {
      const p = this.toPx(pts[i]!, pts[i + 1]!);
      const nextMid = { x: (prev.x + p.x) / 2, y: (prev.y + p.y) / 2 };
      this.ctx.quadraticCurveTo(prev.x, prev.y, nextMid.x, nextMid.y);
      mid = nextMid;
      prev = p;
    }
    this.ctx.lineTo(prev.x, prev.y);
    this.ctx.stroke();
  }
}
