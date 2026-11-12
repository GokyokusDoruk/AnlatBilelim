import type { ReactNode } from 'react';
import { MODE_CONFIG } from '@shared/board';
import type { GameMode, Role, RoundPublicState } from '@shared/types';
import { Badge, ModeTag, TimerBadge } from '../../components/ui';
import { PassMeter, ScorePill } from '../../components/game/Meters';
import { usePlayerName } from '../../store/selectors';
import '../../components/game/game.css';

export const ROLE_LABEL: Record<Role, string> = { narrator: 'Anlatıcı', observer: 'Gözlemci', listener: 'Dinleyici' };

/** Dinleyici ekranındaki fiil: moda göre. */
export const VERB: Record<GameMode, string> = {
  anlatma: 'anlatıyor',
  cizme: 'çiziyor',
  kukla: 'kuklayı oynatıyor',
  onbes: 'anlatıyor',
};

/** Tüm tur ekranlarının ortak çerçevesi: sağ üstte sayaç, altında rol ve mod etiketi. */
export function RoundShell({ round, role, children }: { round: RoundPublicState; role: Role; children: ReactNode }) {
  return (
    <div className="round">
      <TimerBadge endsAt={round.endsAt} totalSec={MODE_CONFIG[round.mode].durationSec} />
      <div className="round__role">
        <Badge tone={round.team === 'A' ? 'team-a' : 'team-b'}>{ROLE_LABEL[role]}</Badge>
        <ModeTag kind={round.mode} />
        <span className="muted" style={{ fontSize: 13 }}>{round.step}. basamak</span>
      </div>
      {children}
    </div>
  );
}

export function PassLine({ round }: { round: RoundPublicState }) {
  const limit = MODE_CONFIG[round.mode].passLimit;
  return (
    <span>
      Pass hakkı <PassMeter used={round.passesUsed} limit={limit} />
    </span>
  );
}

/** Dinleyici: sadece kim ne yapıyor + anlık skor. Kart verisi bu istemciye hiç gelmez. */
export function ListenerView({ round, children }: { round: RoundPublicState; children?: ReactNode }) {
  const narrator = usePlayerName(round.narratorId);
  const net = round.correct - round.forbiddenHits;
  return (
    <div className="listener">
      <div className="listener__headline">
        {narrator} {VERB[round.mode]}
        <span className="listener__dots" aria-hidden />
      </div>
      {children}
      {round.mode === 'anlatma' ? (
        <ScorePill label="Tur skoru" value={net} />
      ) : (
        <ScorePill label="Bilinen" value={round.correct} />
      )}
    </div>
  );
}
