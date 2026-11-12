import { useEffect, useRef } from 'react';
import { BinaryChannel } from '@shared/protocol';
import { createDisposer } from '../../lib/disposer';
import { DrawBoard } from '../../lib/drawBoard';
import { onBinary, sendAction } from '../../net/connection';
import { useConnectionStatus } from '../../store/selectors';
import './draw.css';

const MAX_SIDE = 640;

/**
 * Dinleyicinin canlı izleme tuvali. Anlatıcıdan gelen ikili çizim komutlarını çizer; rAF döngüsü
 * yoktur, parçalar geldikleri anda canvas'a eklenir. Geç katılınca / yeniden bağlanınca
 * Anlatıcı'dan tüm çizimi yeniden ister.
 */
export function ListenerDraw() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const status = useConnectionStatus();

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const d = createDisposer();
    const board = new DrawBoard(canvas);

    const fit = () => board.resize(Math.min(MAX_SIDE, wrap.clientWidth));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    d.add(() => ro.disconnect());
    d.add(onBinary(BinaryChannel.Draw, (buf) => board.applyFrame(buf)));

    return () => {
      d.dispose();
      board.dispose();
    };
  }, []);

  // Açılışta ve her yeniden bağlanmada mevcut çizimi iste.
  useEffect(() => {
    if (status === 'open') sendAction({ t: 'draw:resync' });
  }, [status]);

  return (
    <div className="draw-stage" ref={wrapRef} style={{ width: '100%' }}>
      <canvas ref={canvasRef} className="draw-canvas" role="img" aria-label="Anlatıcının çizimi" />
    </div>
  );
}
