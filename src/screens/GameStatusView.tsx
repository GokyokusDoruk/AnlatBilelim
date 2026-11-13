/** Oyun fazına göre ekran seçici: çark, tur öncesi, tur, özet, oyun sonu. */
import { BOARD_SIZE } from '@shared/constants';
import type { Role } from '@shared/types';
import { Badge, Button, Card, ModeTag } from '../components/ui';
import { ModeRoulette } from '../components/roulette/ModeRoulette';
import { GameOverView, SummaryView } from './EndScreens';
import { RoundScreen } from './rounds/RoundScreen';
import { sendAction, serverNow } from '../net/connection';
import { useGameStore } from '../store/gameStore';
import { useFocusMode, useMyRole, usePlayerName, usePhase, useRound } from '../store/selectors';

const ROLE_LABEL: Record<Role, string> = { narrator: 'Anlatıcı', observer: 'Gözlemci', listener: 'Dinleyici' };

export function GameStatusView() {
  const phase = usePhase();
  const focus = useFocusMode();
  return (
    <>
      {focus ? null : <ScoreBar />}
      <div className="phase-enter" key={phase}>
        {phase === 'roulette' ? <RouletteInfo /> : null}
        {phase === 'pre_round' ? <PreRound /> : null}
        {phase === 'round' ? <RoundScreen /> : null}
        {phase === 'round_summary' ? <SummaryView /> : null}
        {phase === 'game_over' ? <GameOverView /> : null}
      </div>
    </>
  );
}

function ScoreBar() {
  const positions = useGameStore((s) => s.board.positions);
  const turnTeam = useGameStore((s) => s.turnTeam);
  return (
    <div className="teams">
      {(['A', 'B'] as const).map((t) => (
        <Card key={t} team={t}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{t === 'A' ? 'Takım A' : 'Takım B'}</strong>
            {turnTeam === t ? <Badge tone={t === 'A' ? 'team-a' : 'team-b'}>Sırada</Badge> : null}
          </div>
          <div style={{ fontSize: 28, fontFamily: 'var(--font-display)', fontWeight: 800 }}>
            {positions[t]} / {BOARD_SIZE}
          </div>
        </Card>
      ))}
    </div>
  );
}

function RoleLine() {
  const round = useRound();
  const role = useMyRole();
  const narrator = usePlayerName(round?.narratorId);
  const observer = usePlayerName(round?.observerId);
  if (!round || !role) return null;
  return (
    <Card title={`Rolün: ${ROLE_LABEL[role]}`}>
      <div className="stack">
        <div className="row">
          <ModeTag kind={round.mode} />
          <span className="muted">{round.step}. basamak</span>
        </div>
        <span>Anlatıcı: <strong>{narrator}</strong></span>
        <span>Gözlemci: <strong>{observer}</strong></span>
      </div>
    </Card>
  );
}

function RouletteInfo() {
  const roulette = useGameStore((s) => s.roulette);
  if (!roulette) return null;
  return (
    <Card title="Karışık basamak: mod çarkı">
      <ModeRoulette result={roulette.result} startedAt={roulette.startedAt} seed={roulette.seed} now={serverNow} />
    </Card>
  );
}

function PreRound() {
  const role = useMyRole();
  return (
    <>
      <RoleLine />
      {role === 'observer' ? (
        <Button variant="primary" size="lg" block onClick={() => sendAction({ t: 'round:start' })}>
          Tur Başlat
        </Button>
      ) : (
        <p className="muted" style={{ textAlign: 'center' }}>Gözlemcinin turu başlatması bekleniyor.</p>
      )}
    </>
  );
}
