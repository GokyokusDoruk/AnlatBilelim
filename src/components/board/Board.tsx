import { memo, useMemo } from 'react';
import { BOARD_STEPS, nextStepFor } from '@shared/board';
import { BOARD_SIZE } from '@shared/constants';
import type { StepKind, TeamId } from '@shared/types';
import { useSteppedValue } from '../../hooks/useSteppedValue';
import { useGameStore } from '../../store/gameStore';
import { ModeTag } from '../ui';
import { cx } from '../ui/cx';
import './board.css';

const COLS = 9;
const ROWS = 5;
/** Izgara yüksekliği: üstte bir "başlangıç" satırı + 5 basamak satırı. */
const TOTAL_ROWS = ROWS + 1;

const CELL_COLOR: Record<StepKind, string> = {
  anlatma: 'var(--mode-anlatma)',
  cizme: 'var(--mode-cizme)',
  kukla: 'var(--mode-kukla)',
  onbes: 'var(--mode-onbes)',
  karisik: 'var(--mode-karisik)',
};

/** Yılan düzeni: tek sıralar soldan sağa, çift sıralar sağdan sola. */
function cellCoords(step: number): { row: number; col: number } {
  const i = step - 1;
  const row = Math.floor(i / COLS);
  const col = i % COLS;
  return { row, col: row % 2 === 1 ? COLS - 1 - col : col };
}

/** Piyonun konteyner içindeki yüzde konumu. Aynı hücredeki iki takım yan yana durur. */
function tokenStyle(position: number, team: TeamId, shared: boolean) {
  const offsetX = shared ? (team === 'A' ? -0.2 : 0.2) : 0;
  if (position <= 0) {
    const x = team === 'A' ? 6.6 : 7.9; // başlangıç şeridinin sağında, yazının üstüne binmez
    return { left: `${(x / COLS) * 100}%`, top: `${(0.5 / TOTAL_ROWS) * 100}%` };
  }
  const { row, col } = cellCoords(position);
  return {
    left: `${((col + 0.5 + offsetX) / COLS) * 100}%`,
    top: `${((row + 1.5) / TOTAL_ROWS) * 100}%`,
  };
}

const Cell = memo(function Cell({ step, kind, nextA, nextB }: { step: number; kind: StepKind; nextA: boolean; nextB: boolean }) {
  const { row, col } = cellCoords(step);
  return (
    <div
      className={cx(
        'board__cell',
        step === BOARD_SIZE && 'board__cell--finish',
        nextA && 'board__cell--next-a',
        nextB && 'board__cell--next-b',
      )}
      style={{ gridRow: row + 2, gridColumn: col + 1, ['--cell' as string]: CELL_COLOR[kind] }}
    >
      {step === BOARD_SIZE ? '🏁' : step}
    </div>
  );
});

export interface BoardProps {
  positions: Record<TeamId, number>;
  /** Sırası gelen takım; sıradaki basamağı vurgulanır. Null ise vurgu yok. */
  turnTeam: TeamId | null;
}

/** Saf görünüm: 45 basamaklı yılan tahta, takım piyonları adım adım yürür. */
export const BoardView = memo(function BoardView({ positions, turnTeam }: BoardProps) {
  const a = useSteppedValue(positions.A);
  const b = useSteppedValue(positions.B);
  const sharedCell = a > 0 && a === b;
  const nextStep = turnTeam ? nextStepFor(positions[turnTeam]) : null;

  const cells = useMemo(
    () =>
      BOARD_STEPS.map((kind, i) => ({ step: i + 1, kind })),
    [],
  );

  return (
    <div
      className="board"
      role="img"
      aria-label={`Oyun tahtası. Takım A ${positions.A}. basamakta, Takım B ${positions.B}. basamakta.`}
    >
      <div className="board__start">BAŞLANGIÇ</div>
      {cells.map(({ step, kind }) => (
        <Cell
          key={step}
          step={step}
          kind={kind}
          nextA={turnTeam === 'A' && nextStep === step}
          nextB={turnTeam === 'B' && nextStep === step}
        />
      ))}
      <div className="board__tokens">
        <div
          className={cx('board__token', 'board__token--a', turnTeam === 'A' && 'board__token--turn')}
          style={tokenStyle(a, 'A', sharedCell)}
        >
          A
        </div>
        <div
          className={cx('board__token', 'board__token--b', turnTeam === 'B' && 'board__token--turn')}
          style={tokenStyle(b, 'B', sharedCell)}
        >
          B
        </div>
      </div>
    </div>
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
