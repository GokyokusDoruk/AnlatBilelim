/**
 * Task 3 için geçici oyun durumu ekranı: tur döngüsünü uçtan uca doğrulamak için
 * rol, mod, süre ve temel geçişleri gösterir. Gerçek mod ekranları Task 4-7'de gelir.
 */
import { BOARD_SIZE } from '@shared/constants';
import { MODE_CONFIG } from '@shared/board';
import type { Role, TeamId } from '@shared/types';
import { Badge, Button, Card, ModeTag, TimerBadge } from '../components/ui';
import { sendAction } from '../net/connection';
import { useGameStore } from '../store/gameStore';
import { useMyRole, usePlayerName, usePhase, useRound } from '../store/selectors';

const ROLE_LABEL: Record<Role, string> = { narrator: 'Anlatıcı', observer: 'Gözlemci', listener: 'Dinleyici' };

export function GameStatusView() {
  const phase = usePhase();
  return (
    <>
      <ScoreBar />
      {phase === 'roulette' ? <RouletteInfo /> : null}
      {phase === 'pre_round' ? <PreRound /> : null}
      {phase === 'round' ? <RoundInfo /> : null}
      {phase === 'round_summary' ? <Summary /> : null}
      {phase === 'game_over' ? <GameOver /> : null}
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
  return (
    <Card title="Mod çarkı dönüyor…">
      <span className="muted">Karışık basamak: mod rastgele seçiliyor. (Animasyonlu çark Task 4'te.)</span>
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

function RoundInfo() {
  const round = useRound();
  const privateCard = useGameStore((s) => s.privateData?.card ?? null);
  if (!round) return null;
  return (
    <>
      <TimerBadge endsAt={round.endsAt} totalSec={MODE_CONFIG[round.mode].durationSec} />
      <RoleLine />
      <Card title="Tur durumu">
        <div className="stack">
          <span>Bilinen: <strong>{round.correct}</strong> · Yasaklı: <strong>{round.forbiddenHits}</strong></span>
          <span>Pass kullanılan: <strong>{round.passesUsed}</strong> / {MODE_CONFIG[round.mode].passLimit}</span>
          {round.cluesLeft !== null ? <span>Kalan Kelime: <strong>{round.cluesLeft}</strong> / 15</span> : null}
          <span className="muted">{privateCard ? 'Kartın var (arayüz Task 5-7).' : 'Kart yalnızca Anlatıcı ve Gözlemci’de görünür.'}</span>
        </div>
      </Card>
    </>
  );
}

function teamName(t: TeamId) {
  return t === 'A' ? 'Takım A' : 'Takım B';
}

function Summary() {
  const s = useGameStore((x) => x.lastSummary);
  const isHost = useGameStore((x) => x.players.find((p) => p.id === x.selfId)?.isHost ?? false);
  if (!s) return null;
  return (
    <Card title="Tur Bitti!">
      <div className="stack">
        <p style={{ margin: 0 }}>
          {s.correct} kelime bilindi, {s.forbiddenHits} yasaklı kelime kullanıldı. {teamName(s.team)}{' '}
          {s.stepsAdvanced} basamak ilerledi!
        </p>
        {isHost ? <Button onClick={() => sendAction({ t: 'summary:continue' })}>Devam</Button> : <span className="muted">Birazdan otomatik devam edecek.</span>}
      </div>
    </Card>
  );
}

function GameOver() {
  const winner = useGameStore((x) => x.winner);
  const isHost = useGameStore((x) => x.players.find((p) => p.id === x.selfId)?.isHost ?? false);
  return (
    <Card title={winner ? `${teamName(winner)} kazandı!` : 'Oyun bitti'}>
      {isHost ? <Button variant="primary" onClick={() => sendAction({ t: 'summary:continue' })}>Lobiye dön</Button> : <span className="muted">Kurucu lobiye dönecek.</span>}
    </Card>
  );
}
