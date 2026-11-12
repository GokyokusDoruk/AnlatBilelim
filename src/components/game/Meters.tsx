import { memo } from 'react';
import { cx } from '../ui';
import './game.css';

export const PassMeter = memo(function PassMeter({ used, limit }: { used: number; limit: number }) {
  return (
    <span className="pass-meter" aria-label={`Kalan pass: ${limit - used} / ${limit}`}>
      {Array.from({ length: limit }, (_, i) => (
        <span key={i} className={cx('pass-meter__pip', i < used && 'pass-meter__pip--used')} />
      ))}
    </span>
  );
});

export const ScorePill = memo(function ScorePill({ label, value }: { label: string; value: number }) {
  return (
    <span className="score-pill">
      <span className="muted" style={{ fontSize: 13 }}>{label}</span>
      <span className={cx('score-pill__value', value > 0 && 'score-pill__value--pos', value < 0 && 'score-pill__value--neg')}>
        {value > 0 ? `+${value}` : value}
      </span>
    </span>
  );
});

/** Büyük "15" sayacı (15 Kelime modu). */
export const ClueCounter = memo(function ClueCounter({ left, total }: { left: number; total: number }) {
  return (
    <div className={cx('clue-counter', left <= 3 && 'clue-counter--low')}>
      <div className="clue-counter__label">Kalan kelime</div>
      <div className="clue-counter__value" aria-live="polite">{left}</div>
      <div className="clue-counter__label">/ {total}</div>
    </div>
  );
});
