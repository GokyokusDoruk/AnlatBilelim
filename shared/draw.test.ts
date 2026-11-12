import { describe, expect, it } from 'vitest';
import { BinaryChannel, readBinaryChannel } from './protocol';
import {
  DrawEncoder,
  DrawParser,
  StrokeStore,
  decodeDrawFrame,
  encodeDrawFrame,
  fromCoord,
  packStyle,
  toCoord,
  unpackStyle,
  type DrawHandlers,
  type StrokeStyle,
} from './draw';

function storeHandlers(store: StrokeStore): DrawHandlers {
  return {
    begin: (s, x, y) => void store.begin(s, x, y),
    point: (x, y) => void store.point(x, y),
    end: () => store.end(),
    clear: () => store.clear(),
    undo: () => store.undo(),
  };
}

const style: StrokeStyle = { color: 3, width: 2, eraser: false };

describe('çizim kodlaması', () => {
  it('stil paketleme gidiş-dönüş', () => {
    for (let color = 0; color < 8; color++)
      for (let width = 0; width < 4; width++)
        for (const eraser of [false, true]) expect(unpackStyle(packStyle({ color, width, eraser }))).toEqual({ color, width, eraser });
  });

  it('koordinatlar 0..1 aralığına sıkıştırılır ve 15 bitte kalır', () => {
    expect(toCoord(-1)).toBe(0);
    expect(toCoord(2)).toBe(0x7fff);
    expect(Math.abs(fromCoord(toCoord(0.4321)) - 0.4321)).toBeLessThan(1 / 0x7fff);
    for (let v = 0; v <= 1; v += 0.01) expect(toCoord(v) & 0x8000).toBe(0); // koordinat asla komut gibi görünmez
  });

  it('çerçeve başlığı Draw kanalıdır ve yük sözcük olarak okunur', () => {
    const buf = encodeDrawFrame([1, 2, 3]);
    expect(readBinaryChannel(buf)).toBe(BinaryChannel.Draw);
    expect(Array.from(decodeDrawFrame(buf)!)).toEqual([1, 2, 3]);
  });

  it('kodlayıcı + ayrıştırıcı: çizgiler birebir aktarılır, çerçeve çizginin ortasında bölünse de', () => {
    const enc = new DrawEncoder();
    const local = new StrokeStore();
    const lh = storeHandlers(local);
    enc.begin(style, 100, 200); lh.begin(style, 100, 200);
    for (let i = 0; i < 300; i++) { enc.point(i, i + 1); lh.point(i, i + 1); }
    enc.end(); lh.end();
    enc.begin({ color: 1, width: 0, eraser: true }, 5, 6); lh.begin({ color: 1, width: 0, eraser: true }, 5, 6);
    enc.point(7, 8); lh.point(7, 8); enc.end(); lh.end();

    const remote = new StrokeStore();
    const parser = new DrawParser();
    let frames = 0;
    for (let p = enc.peek(97); p; p = enc.peek(97)) {   // tuhaf boyutlu parçalar
      parser.push(decodeDrawFrame(p.frame)!, storeHandlers(remote));
      enc.consume(p.count);
      frames++;
    }
    expect(frames).toBeGreaterThan(3);
    expect(remote.strokes).toEqual(local.strokes);
    expect(remote.strokes).toHaveLength(2);
    expect(remote.strokes[0]!.pts).toHaveLength(2 + 600);
  });

  it('geri al ve temizle uzak tarafta da uygulanır', () => {
    const enc = new DrawEncoder();
    for (let i = 0; i < 3; i++) { enc.begin(style, i, i); enc.point(i + 1, i + 1); enc.end(); }
    enc.undo();
    const remote = new StrokeStore();
    new DrawParser().push(decodeDrawFrame(enc.peek()!.frame)!, storeHandlers(remote));
    expect(remote.strokes).toHaveLength(2);
    const enc2 = new DrawEncoder(); enc2.clear();
    new DrawParser().push(decodeDrawFrame(enc2.peek()!.frame)!, storeHandlers(remote));
    expect(remote.strokes).toHaveLength(0);
    expect(remote.pointCount).toBe(0);
  });

  it('anlık görüntü (yeniden senkron) boş bir dinleyiciyi aynı çizime getirir', () => {
    const src = new StrokeStore();
    const h = storeHandlers(src);
    h.begin(style, 1, 2); h.point(3, 4); h.point(5, 6); h.end();
    h.begin({ color: 0, width: 3, eraser: true }, 9, 9); h.end();
    const dst = new StrokeStore();
    dst.begin(style, 0, 0); // dinleyicide eski/yanlış bir çizim vardı
    new DrawParser().push(src.snapshotWords(), storeHandlers(dst));
    expect(dst.strokes).toEqual(src.strokes);
  });

  it('sınırlar: çok fazla çizgi bellek şişirmez', () => {
    const s = new StrokeStore();
    for (let i = 0; i < 2000; i++) { s.begin(style, 1, 1); s.point(2, 2); s.end(); }
    expect(s.strokes.length).toBeLessThanOrEqual(500);
  });

  it('bozuk akış ayrıştırıcıyı çökertmez', () => {
    const s = new StrokeStore();
    const p = new DrawParser();
    expect(() => p.push([5, 6, 0x8999, 0x8001, 7, 0x8002, 0x8001, 1, 2], storeHandlers(s))).not.toThrow();
  });
});
