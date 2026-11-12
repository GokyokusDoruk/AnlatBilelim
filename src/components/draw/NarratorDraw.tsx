import { useEffect, useRef, useState } from 'react';
import { canPass, passCost, passesLeft } from '@shared/board';
import { BinaryChannel } from '@shared/protocol';
import { DRAW_COLORS, DRAW_WIDTHS, DrawEncoder, toCoord, type StrokeStyle } from '@shared/draw';
import type { RoundPublicState, TripleCard } from '@shared/types';
import { createDisposer } from '../../lib/disposer';
import { DrawBoard } from '../../lib/drawBoard';
import { onDrawResync, sendAction, sendBinary } from '../../net/connection';
import { ActionButton } from '../game/ActionButton';
import { PassMeter } from '../game/Meters';
import { Button, cx } from '../ui';
import './draw.css';

const MAX_SIDE = 640;
const RETRY_MS = 120;
const RESYNC_DEBOUNCE_MS = 400;

/**
 * Anlatıcının tuvali. Çizim komutları normalize koordinat olarak ~60 Hz'e kadar akıtılır
 * (görüntü gönderilmez). `key` kart kelimelerine bağlı olduğundan yeni kartta bileşen yeniden kurulur:
 * tuval temizlenir ve Dinleyicilere CLEAR gider.
 */
export function NarratorDraw({ round, card }: { round: RoundPublicState; card: TripleCard }) {
  return <NarratorDrawInner key={card.words.join('|')} round={round} card={card} />;
}

function NarratorDrawInner({ round, card }: { round: RoundPublicState; card: TripleCard }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardRef = useRef<DrawBoard | null>(null);
  const encRef = useRef(new DrawEncoder());
  const flushRef = useRef<() => void>(() => {});

  const [color, setColor] = useState(0);
  const [width, setWidth] = useState(1);
  const [eraser, setEraser] = useState(false);
  const styleRef = useRef<StrokeStyle>({ color, width, eraser });
  styleRef.current = { color, width, eraser };
  const drawing = useRef(false);
  const lastPt = useRef<[number, number] | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const d = createDisposer();
    const board = new DrawBoard(canvas);
    boardRef.current = board;
    const enc = encRef.current;

    const fit = () => {
      const side = Math.min(MAX_SIDE, wrap.clientWidth, Math.max(240, window.innerHeight - 400));
      board.resize(side);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    d.add(() => ro.disconnect());

    // ---- Ağ: bekleyen komutları ~60 Hz'e kadar gönder; gitmezse yeniden dene (kare kaybı çizimi bozar) ----
    let raf = 0;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      raf = 0;
      for (let p = enc.peek(); p; p = enc.peek()) {
        if (!sendBinary(BinaryChannel.Draw, p.payload)) {
          retry = setTimeout(() => {
            retry = null;
            flush();
          }, RETRY_MS);
          return;
        }
        enc.consume(p.count);
      }
    };
    const schedule = () => {
      if (raf === 0 && retry === null && !d.disposed) raf = requestAnimationFrame(flush);
    };
    flushRef.current = schedule;
    d.add(() => {
      if (raf) cancelAnimationFrame(raf);
      if (retry !== null) clearTimeout(retry);
      enc.clearPending();
    });

    // Yeni kart / yeniden bağlanma: Dinleyicilerin tuvalini sıfırla.
    enc.clear();
    schedule();

    // Dinleyici çizimi baştan isterse tüm çizimi anlık görüntü olarak gönder.
    let lastResync = 0;
    d.add(
      onDrawResync(() => {
        const now = performance.now();
        if (now - lastResync < RESYNC_DEBOUNCE_MS) return;
        lastResync = now;
        enc.replacePending(board.store.snapshotWords(drawing.current));
        schedule();
      }),
    );

    return () => {
      boardRef.current = null;
      flushRef.current = () => {};
      d.dispose();
      board.dispose();
    };
  }, []);

  // ---- Çizim girdisi ----
  const coords = (e: { clientX: number; clientY: number }): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [toCoord((e.clientX - rect.left) / rect.width), toCoord((e.clientY - rect.top) / rect.height)];
  };

  const begin = (x: number, y: number) => {
    const board = boardRef.current;
    if (!board || !board.canDraw) return;
    const style = { ...styleRef.current };
    board.begin(style, x, y);
    encRef.current.begin(style, x, y);
    lastPt.current = [x, y];
    drawing.current = true;
  };
  const move = (x: number, y: number) => {
    const board = boardRef.current;
    const last = lastPt.current;
    if (!board || !drawing.current || (last && last[0] === x && last[1] === y)) return;
    board.point(x, y);
    encRef.current.point(x, y);
    lastPt.current = [x, y];
  };
  const finish = () => {
    if (!drawing.current) return;
    drawing.current = false;
    lastPt.current = null;
    boardRef.current?.end();
    encRef.current.end();
    flushRef.current();
  };

  const act = (fn: (b: DrawBoard, e: DrawEncoder) => void) => {
    const board = boardRef.current;
    if (!board) return;
    finish();
    fn(board, encRef.current);
    flushRef.current();
  };

  const left = passesLeft(round.mode, round.passesUsed);
  const cost = passCost(card);

  return (
    <div className="stack">
      <div className="draw-words">
        {card.words.map((w, i) => (
          <div key={w} className={cx('draw-word', card.solved[i] && 'draw-word--solved')}>
            {w}
          </div>
        ))}
      </div>

      <div className="draw-stage" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="draw-canvas draw-canvas--active"
          aria-label="Çizim tuvali"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            const [x, y] = coords(e);
            begin(x, y);
            flushRef.current();
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
            for (const ev of events.length > 0 ? events : [e.nativeEvent]) {
              const [x, y] = coords(ev);
              move(x, y);
            }
            flushRef.current();
          }}
          onPointerUp={finish}
          onPointerCancel={finish}
          onLostPointerCapture={finish}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>

      <div className="draw-toolbar">
        <div className="draw-toolbar__row" role="radiogroup" aria-label="Renk">
          {DRAW_COLORS.map((c, i) => (
            <button
              key={c}
              type="button"
              className={cx('swatch', !eraser && color === i && 'swatch--on')}
              style={{ ['--swatch' as string]: c }}
              aria-label={`Renk ${i + 1}`}
              onClick={() => {
                setColor(i);
                setEraser(false);
              }}
            />
          ))}
        </div>
        <div className="draw-toolbar__row">
          {DRAW_WIDTHS.map((w, i) => (
            <button
              key={w}
              type="button"
              className={cx('width-btn', width === i && 'width-btn--on')}
              aria-label={`Kalınlık ${i + 1}`}
              onClick={() => setWidth(i)}
            >
              <span className="width-btn__dot" style={{ width: 4 + i * 5, height: 4 + i * 5 }} />
            </button>
          ))}
          <Button size="sm" variant={eraser ? 'primary' : 'default'} onClick={() => setEraser((v) => !v)}>
            Silgi
          </Button>
          <Button size="sm" onClick={() => act((b, e) => { b.undo(); e.undo(); })}>
            Geri al
          </Button>
          <Button size="sm" variant="danger" onClick={() => act((b, e) => { b.clear(); e.clear(); })}>
            Temizle
          </Button>
        </div>
      </div>

      <ActionButton
        variant="primary"
        size="lg"
        block
        disabled={!canPass(round.mode, round.passesUsed, card)}
        onClick={() => sendAction({ t: 'round:pass' })}
      >
        Pass ({left} hak kaldı)
      </ActionButton>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span>
          Pass hakkı <PassMeter used={round.passesUsed} limit={3} />
        </span>
        <span className="muted" style={{ fontSize: 13 }}>
          Pass {cost} hak düşer{left < cost ? ' (yetmiyor)' : ''}
        </span>
      </div>
    </div>
  );
}
