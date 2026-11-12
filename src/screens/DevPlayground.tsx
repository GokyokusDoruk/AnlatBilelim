/** Geliştirme önizlemesi (/dev/ui): tahta ve çarkı sunucusuz dener. Üretimde kullanılmaz. */
import { useCallback, useState } from 'react';
import { ALL_MODES } from '@shared/board';
import type { GameMode, TeamId } from '@shared/types';
import { BoardLegend, BoardView } from '../components/board/Board';
import { ModeRoulette } from '../components/roulette/ModeRoulette';
import { Button, Card, Screen } from '../components/ui';

export function DevPlayground() {
  const [pos, setPos] = useState<Record<TeamId, number>>({ A: 0, B: 0 });
  const [turn, setTurn] = useState<TeamId>('A');
  const [spin, setSpin] = useState<{ result: GameMode; startedAt: number; seed: number; key: number } | null>(null);
  const now = useCallback(() => Date.now(), []);

  const move = (team: TeamId, delta: number) =>
    setPos((p) => ({ ...p, [team]: Math.max(0, Math.min(45, p[team] + delta)) }));

  return (
    <Screen>
      <Card title="Tahta">
        <BoardView positions={pos} turnTeam={turn} />
        <BoardLegend />
        <div className="stack" style={{ marginTop: 12 }}>
          {(['A', 'B'] as const).map((t) => (
            <div className="row" key={t}>
              <strong style={{ width: 70 }}>Takım {t}</strong>
              <Button data-testid={`${t}-minus`} size="sm" onClick={() => move(t, -1)}>-1</Button>
              <Button data-testid={`${t}-plus`} size="sm" onClick={() => move(t, 1)}>+1</Button>
              <Button data-testid={`${t}-plus5`} size="sm" onClick={() => move(t, 5)}>+5</Button>
              <Button size="sm" variant="ghost" onClick={() => setTurn(t)}>Sıra</Button>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Çark">
        <Button
          data-testid="spin"
          block
          onClick={() =>
            setSpin({
              result: ALL_MODES[Math.floor(Math.random() * 4)]!,
              startedAt: Date.now(),
              seed: Math.floor(Math.random() * 1e9),
              key: Date.now(),
            })
          }
        >
          Çevir
        </Button>
        {spin ? <ModeRoulette key={spin.key} result={spin.result} startedAt={spin.startedAt} seed={spin.seed} now={now} /> : null}
      </Card>
    </Screen>
  );
}
