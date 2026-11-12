import { useEffect, useRef, useState } from 'react';
import { ALL_MODES, MODE_CONFIG } from '@shared/board';
import { ROULETTE_SPIN_MS, SEGMENT_DEG, rouletteAngle } from '@shared/roulette';
import type { GameMode } from '@shared/types';
import { createDisposer } from '../../lib/disposer';
import { MODE_COLORS } from '../../theme/modeColors';
import { ModeTag } from '../ui';
import './roulette.css';

export interface ModeRouletteProps {
  result: GameMode;
  /** Sunucu saatine göre çarkın başladığı an (epoch ms). */
  startedAt: number;
  seed: number;
  /** Sunucu saatine göre şimdi (geç bağlanan / yeniden bağlanan doğru kareyi görsün). */
  now: () => number;
}

const MAX_SIZE = 320;
const MAX_DPR = 2;

/** Çarkı bir kez çizer; dönüş CSS transform ile GPU'da yapılır. */
function drawWheel(canvas: HTMLCanvasElement, size: number): void {
  const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const c = size / 2;
  const r = c - 2;
  ctx.clearRect(0, 0, size, size);

  ALL_MODES.forEach((mode, i) => {
    // Dilim 0 tepeden (−90°) başlayıp saat yönünde ilerler; shared/roulette.ts ile aynı düzen.
    const start = ((i * SEGMENT_DEG - 90) * Math.PI) / 180;
    const end = (((i + 1) * SEGMENT_DEG - 90) * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.arc(c, c, r, start, end);
    ctx.closePath();
    ctx.fillStyle = MODE_COLORS[mode];
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#14102a';
    ctx.stroke();

    ctx.save();
    ctx.translate(c, c);
    ctx.rotate((start + end) / 2);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#120e26';
    ctx.font = `800 ${Math.round(size * 0.068)}px "Baloo 2", system-ui, sans-serif`;
    ctx.fillText(MODE_CONFIG[mode].label, r - size * 0.06, 0);
    ctx.restore();
  });
}

export function ModeRoulette({ result, startedAt, seed, now }: ModeRouletteProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [revealed, setRevealed] = useState(() => now() - startedAt >= ROULETTE_SPIN_MS);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const d = createDisposer();

    const size = () => Math.min(MAX_SIZE, Math.max(200, window.innerWidth - 64));
    drawWheel(canvas, size());
    d.listen(window, 'resize', () => drawWheel(canvas, size()));

    const apply = (elapsed: number) => {
      canvas.style.transform = `rotate(${rouletteAngle(result, seed, elapsed).toFixed(2)}deg)`;
    };

    let raf = 0;
    const frame = () => {
      const elapsed = now() - startedAt;
      apply(elapsed);
      if (elapsed >= ROULETTE_SPIN_MS) {
        setRevealed(true);
        return; // Çark durdu: rAF döngüsü kapanır, boşta CPU harcanmaz.
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    d.add(() => cancelAnimationFrame(raf));

    // Canvas belleğini hemen bırak.
    d.add(() => {
      canvas.width = 0;
      canvas.height = 0;
    });
    return () => d.dispose();
  }, [result, startedAt, seed, now]);

  return (
    <div className="roulette">
      <div className="roulette__stage">
        <div className="roulette__pointer" aria-hidden />
        <div className="roulette__clip">
          <canvas ref={canvasRef} className="roulette__wheel" role="img" aria-label="Mod çarkı" />
        </div>
        <div className="roulette__hub" aria-hidden />
      </div>
      <div className={revealed ? 'roulette__result roulette__result--in' : 'roulette__result'} aria-live="polite">
        {revealed ? (
          <>
            <span>Bu tur:</span>
            <ModeTag kind={result} />
          </>
        ) : (
          <span className="muted">Çark dönüyor…</span>
        )}
      </div>
    </div>
  );
}
