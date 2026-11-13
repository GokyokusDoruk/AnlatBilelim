import { memo, useCallback, useMemo, useState } from 'react';
import { BOARD_STEPS, MODE_CONFIG, nextStepFor } from '@shared/board';
import { BOARD_SIZE } from '@shared/constants';
import type { StepKind, TeamId } from '@shared/types';
import { useSteppedValue } from '../../hooks/useSteppedValue';
import { useGameStore } from '../../store/gameStore';
import { ModeTag } from '../ui';
import { buildSpiral, starPoints, VIEW } from './spiral';
import { cx } from '../ui/cx';
import './board.css';

const CELL_COLOR: Record<StepKind, string> = {
  anlatma: 'var(--mode-anlatma)',
  cizme: 'var(--mode-cizme)',
  kukla: 'var(--mode-kukla)',
  onbes: 'var(--mode-onbes)',
  karisik: 'url(#board-mix)',
};

const KIND_LABEL: Record<StepKind, string> = {
  anlatma: MODE_CONFIG.anlatma.label,
  cizme: MODE_CONFIG.cizme.label,
  kukla: MODE_CONFIG.kukla.label,
  onbes: MODE_CONFIG.onbes.label,
  karisik: 'Karışık',
};

const CELL_R = 12;
const LAYOUT = buildSpiral();
/** Başlangıç noktasının biraz dışında: piyonlar "başla" işaretinde bekler. */
const START = (() => {
  const a = LAYOUT.points[0]!;
  const b = LAYOUT.points[1]!;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: a.x - ((b.x - a.x) / len) * 26, y: a.y - ((b.y - a.y) / len) * 26 };
})();

/** Piyonun SVG koordinatı. Aynı hücredeki iki takım yan yana durur. */
function tokenPos(position: number, team: TeamId, shared: boolean) {
  const base = position <= 0 ? START : LAYOUT.points[Math.min(position, BOARD_SIZE)]!;
  const dx = shared ? (team === 'A' ? -9 : 9) : position <= 0 ? (team === 'A' ? -9 : 9) : 0;
  return { x: base.x + dx, y: base.y - (position === BOARD_SIZE ? 4 : 0) };
}

interface CellProps {
  step: number;
  kind: StepKind;
  nextA: boolean;
  nextB: boolean;
  selected: boolean;
  onPick: (step: number) => void;
}

const Cell = memo(function Cell({ step, kind, nextA, nextB, selected, onPick }: CellProps) {
  const p = LAYOUT.points[step]!;
  const finish = step === BOARD_SIZE;
  const label = finish ? `${step}. basamak, bitiş` : `${step}. basamak, ${KIND_LABEL[kind]}`;
  return (
    <g
      className={cx('board__cell', finish && 'board__cell--finish', selected && 'board__cell--selected')}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={selected}
      onClick={(e) => {
        e.stopPropagation();
        onPick(step);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPick(step);
        }
      }}
    >
      <circle className="board__hit" cx={p.x} cy={p.y} r={finish ? 24 : CELL_R + 4} />
      {selected ? <circle className="board__ring" cx={p.x} cy={p.y} r={finish ? 26 : CELL_R + 3} /> : null}
      {nextA || nextB ? (
        <circle className={cx('board__next', nextA ? 'board__next--a' : 'board__next--b')} cx={p.x} cy={p.y} r={finish ? 24 : CELL_R + 5} />
      ) : null}
      {finish ? (
        <polygon points={starPoints(p.x, p.y, 22, 9.5)} fill="var(--accent)" stroke="#fff6cf" strokeWidth={1.5} strokeLinejoin="round" />
      ) : (
        <>
          <circle cx={p.x} cy={p.y} r={CELL_R} fill={CELL_COLOR[kind]} />
          <text x={p.x} y={p.y} className="board__num">
            {step}
          </text>
        </>
      )}
    </g>
  );
});

/** Seçili basamağın modunu hücrenin üstünde (sığmazsa altında) küçük bir etiketle gösterir. */
function StepTip({ step }: { step: number }) {
  const p = LAYOUT.points[step]!;
  const finish = step === BOARD_SIZE;
  const kind = BOARD_STEPS[step - 1]!;
  const text = finish ? `${step} · Bitiş` : `${step} · ${KIND_LABEL[kind]}`;
  const w = text.length * 6.4 + 18;
  const h = 22;
  const x = Math.min(VIEW - w - 4, Math.max(4, p.x - w / 2));
  const above = p.y - (finish ? 30 : 20) - h > 4;
  const y = above ? p.y - (finish ? 30 : 20) - h : p.y + (finish ? 30 : 20);
  const cx0 = p.x - x;
  return (
    <g className="board__tip" transform={`translate(${x} ${y})`} pointerEvents="none" role="status">
      <rect width={w} height={h} rx={11} style={{ stroke: CELL_COLOR[kind] === 'url(#board-mix)' ? 'var(--accent)' : CELL_COLOR[kind] }} />
      <path d={above ? `M${cx0 - 5} ${h - 0.5} L${cx0} ${h + 5} L${cx0 + 5} ${h - 0.5}` : `M${cx0 - 5} 0.5 L${cx0} -5 L${cx0 + 5} 0.5`} />
      <text x={w / 2} y={h / 2}>
        {text}
      </text>
    </g>
  );
}

export interface BoardProps {
  positions: Record<TeamId, number>;
  /** Sırası gelen takım; sıradaki basamağı vurgulanır. Null ise vurgu yok. */
  turnTeam: TeamId | null;
}

/** Saf görünüm: içe doğru kıvrılan spiral tahta (45. basamak ortada yıldız), piyonlar adım adım yürür. */
export const BoardView = memo(function BoardView({ positions, turnTeam }: BoardProps) {
  const a = useSteppedValue(positions.A);
  const b = useSteppedValue(positions.B);
  const sharedCell = a > 0 && a === b;
  const nextStep = turnTeam ? nextStepFor(positions[turnTeam]) : null;
  const steps = useMemo(() => BOARD_STEPS.map((kind, i) => ({ step: i + 1, kind })), []);
  const [picked, setPicked] = useState<number | null>(null);
  const onPick = useCallback((step: number) => setPicked((cur) => (cur === step ? null : step)), []);
  const pa = tokenPos(a, 'A', sharedCell);
  const pb = tokenPos(b, 'B', sharedCell);

  return (
    <svg
      className="board"
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      role="img"
      aria-label={`Oyun tahtası. Takım A ${positions.A}. basamakta, Takım B ${positions.B}. basamakta. Bir basamağa dokunarak modunu görebilirsin.`}
      onClick={() => setPicked(null)}
    >
      <defs>
        <linearGradient id="board-mix" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffb020" />
          <stop offset="0.35" stopColor="#2ed47a" />
          <stop offset="0.65" stopColor="#c06bff" />
          <stop offset="1" stopColor="#22c3e6" />
        </linearGradient>
      </defs>
      <path className="board__path" d={LAYOUT.path} />
      <g className="board__start" transform={`translate(${START.x} ${START.y})`}>
        <circle r={19} />
        <text y={1}>BAŞLA</text>
      </g>
      {steps.map(({ step, kind }) => (
        <Cell key={step} step={step} kind={kind} nextA={turnTeam === 'A' && nextStep === step} nextB={turnTeam === 'B' && nextStep === step} selected={picked === step} onPick={onPick} />
      ))}
      {picked !== null ? <StepTip step={picked} /> : null}
      <g className={cx('board__token', 'board__token--a', turnTeam === 'A' && 'board__token--turn')} style={{ transform: `translate(${pa.x}px, ${pa.y}px)` }}>
        <circle r={9} />
        <text>A</text>
      </g>
      <g className={cx('board__token', 'board__token--b', turnTeam === 'B' && 'board__token--turn')} style={{ transform: `translate(${pb.x}px, ${pb.y}px)` }}>
        <circle r={9} />
        <text>B</text>
      </g>
    </svg>
  );
});

export function BoardLegend() {
  return (
    <div className="board-legend">
      {(['anlatma', 'cizme', 'kukla', 'onbes', 'karisik'] as const).map((k) => (
        <ModeTag key={k} kind={k} />
      ))}
    </div>
  );
}

/** Store'a bağlı sürüm: yalnızca pozisyonlar ve sıra değişince render olur. */
export function Board({ showLegend = true, highlightTurn = true }: { showLegend?: boolean; highlightTurn?: boolean }) {
  const positions = useGameStore((s) => s.board.positions);
  const turnTeam = useGameStore((s) => (highlightTurn && s.phase !== 'lobby' && s.phase !== 'game_over' ? s.turnTeam : null));
  return (
    <div>
      <BoardView positions={positions} turnTeam={turnTeam} />
      {showLegend ? <BoardLegend /> : null}
    </div>
  );
}
