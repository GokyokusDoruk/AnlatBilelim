/** Tur özeti ve oyun sonu ekranları. Süsleme sadece CSS'tir (canvas / rAF yok), sızıntı riski taşımaz. */
import { BOARD_SIZE } from '@shared/constants';
import type { RoundSummary, TeamId } from '@shared/types';
import { Button, Card, ModeTag } from '../components/ui';
import { sendAction } from '../net/connection';
import { useGameStore } from '../store/gameStore';
import './end.css';

const teamName = (t: TeamId) => (t === 'A' ? 'Takım A' : 'Takım B');

function useIsHost() {
  return useGameStore((x) => x.players.find((p) => p.id === x.selfId)?.isHost ?? false);
}

function TeamBar({ team, position, gained }: { team: TeamId; position: number; gained: number }) {
  const pct = Math.min(100, (position / BOARD_SIZE) * 100);
  return (
    <div className="endbar">
      <div className="endbar__head">
        <strong>{teamName(team)}</strong>
        <span>
          {position} / {BOARD_SIZE}
          {gained > 0 ? <em className="endbar__gain"> +{gained}</em> : null}
        </span>
      </div>
      <div className="endbar__track">
        <div className={`endbar__fill endbar__fill--${team}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'good' | 'bad' }) {
  return (
    <div className={`stat${tone ? ` stat--${tone}` : ''}`}>
      <div className="stat__value">{value}</div>
      <div className="stat__label">{label}</div>
    </div>
  );
}

function summaryHeadline(s: RoundSummary): string {
  if (s.stepsAdvanced === 0) return 'Bu tur adım gelmedi';
  if (s.stepsAdvanced >= 5) return 'Harika bir tur!';
  return `${s.stepsAdvanced} adım ilerledi`;
}

export function SummaryView() {
  const s = useGameStore((x) => x.lastSummary);
  const positions = useGameStore((x) => x.board.positions);
  const isHost = useIsHost();
  if (!s) return null;
  const other: TeamId = s.team === 'A' ? 'B' : 'A';
  return (
    <Card title="Tur Bitti!" team={s.team}>
      <div className="stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <ModeTag kind={s.mode} />
          <strong>{summaryHeadline(s)}</strong>
        </div>
        {s.endedByClueLimit ? <span className="muted">15 ipucu hakkı bitti, tur erken sona erdi.</span> : null}
        <div className="stats">
          <Stat label="Bilinen" value={s.correct} tone="good" />
          {s.mode === 'anlatma' ? <Stat label="Yasaklı" value={s.forbiddenHits} tone={s.forbiddenHits ? 'bad' : undefined} /> : null}
          <Stat label="Pass" value={s.passesUsed} />
          <Stat label="Adım" value={`+${s.stepsAdvanced}`} tone={s.stepsAdvanced ? 'good' : undefined} />
        </div>
        <TeamBar team={s.team} position={s.newPosition} gained={s.stepsAdvanced} />
        <TeamBar team={other} position={positions[other]} gained={0} />
        {isHost ? (
          <Button variant="primary" onClick={() => sendAction({ t: 'summary:continue' })}>
            Devam
          </Button>
        ) : (
          <span className="muted">Birazdan otomatik devam edecek.</span>
        )}
      </div>
    </Card>
  );
}

const CONFETTI = Array.from({ length: 28 }, (_, i) => i);

export function GameOverView() {
  const winner = useGameStore((x) => x.winner);
  const positions = useGameStore((x) => x.board.positions);
  const isHost = useIsHost();
  return (
    <div className={`gameover${winner ? ` gameover--${winner}` : ''}`}>
      {winner ? (
        <div className="confetti" aria-hidden>
          {CONFETTI.map((i) => (
            <span key={i} style={{ ['--i' as string]: i }} />
          ))}
        </div>
      ) : null}
      <Card title={winner ? `${teamName(winner)} kazandı!` : 'Oyun bitti'} team={winner}>
        <div className="stack">
          <div className="gameover__trophy" aria-hidden>
            🏆
          </div>
          <TeamBar team="A" position={positions.A} gained={0} />
          <TeamBar team="B" position={positions.B} gained={0} />
          {isHost ? (
            <Button variant="primary" size="lg" block onClick={() => sendAction({ t: 'summary:continue' })}>
              Lobiye dön
            </Button>
          ) : (
            <span className="muted">Kurucu lobiye dönecek.</span>
          )}
        </div>
      </Card>
    </div>
  );
}
