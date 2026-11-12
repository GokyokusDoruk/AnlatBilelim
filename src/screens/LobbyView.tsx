import { MIN_PLAYERS_PER_TEAM } from '@shared/constants';
import { LEVEL_LABELS, WORD_LEVELS, type TeamId } from '@shared/types';
import { Button, Card, PlayerChip } from '../components/ui';
import { sendAction } from '../net/connection';
import { useGameStore } from '../store/gameStore';
import { useSelf, useTeamPlayers } from '../store/selectors';

const TEAM_TITLES: Record<TeamId, string> = { A: 'Takım A · Kırmızı', B: 'Takım B · Mavi' };

export function LobbyView() {
  return (
    <>
      <div className="teams">
        <TeamCard team="A" />
        <TeamCard team="B" />
      </div>
      <UnassignedCard />
      <LevelCard />
      <ReadyBar />
    </>
  );
}

function TeamCard({ team }: { team: TeamId }) {
  const players = useTeamPlayers(team);
  const self = useSelf();
  const selfId = useGameStore((s) => s.selfId);
  const inTeam = self?.team === team;
  return (
    <Card team={team} title={`${TEAM_TITLES[team]} (${players.length})`}>
      <div className="stack">
        {players.length === 0 ? <span className="muted">Henüz kimse yok</span> : null}
        {players.map((p) => (
          <PlayerChip key={p.id} player={p} isSelf={p.id === selfId} />
        ))}
        {!inTeam ? (
          <Button variant={team === 'A' ? 'team-a' : 'team-b'} block onClick={() => sendAction({ t: 'lobby:setTeam', team })}>
            Bu takıma geç
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

const LEVEL_HINTS: Record<number, string> = {
  1: 'Günlük, herkesin bildiği kelimeler',
  2: 'Biraz daha az bilinen eşya, meslek ve yerler',
  3: 'Kavramlar, duygular ve zor tarifler',
  4: 'Deyimler, tarih, kültür ve soyut kelimeler',
};

/** Kelime seviyesi: yalnızca oda kurucusu değiştirebilir, herkes görür. */
function LevelCard() {
  const level = useGameStore((s) => s.level);
  const isHost = useSelf()?.isHost ?? false;
  return (
    <Card title="Kelime seviyesi">
      <div className="stack">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }} role="radiogroup" aria-label="Kelime seviyesi">
          {WORD_LEVELS.map((lv) => (
            <Button
              key={lv}
              variant={lv === level ? 'success' : 'default'}
              disabled={!isHost}
              aria-pressed={lv === level}
              onClick={() => sendAction({ t: 'lobby:setLevel', level: lv })}
            >
              {lv} · {LEVEL_LABELS[lv]}
            </Button>
          ))}
        </div>
        <span className="muted">
          {LEVEL_HINTS[level]}
          {isHost ? '' : ' (seviyeyi oda kurucusu seçer)'}
        </span>
      </div>
    </Card>
  );
}

function UnassignedCard() {
  const players = useTeamPlayers(null);
  const selfId = useGameStore((s) => s.selfId);
  if (players.length === 0) return null;
  return (
    <Card title="Takım seçmeyenler">
      <div className="stack">
        {players.map((p) => (
          <PlayerChip key={p.id} player={p} isSelf={p.id === selfId} />
        ))}
      </div>
    </Card>
  );
}

/** Başlatma koşulunun neden sağlanmadığını söyler; sunucu zaten tek otoritedir. */
function useLobbyHint(): string | null {
  return useGameStore((s) => {
    const a = s.players.filter((p) => p.team === 'A').length;
    const b = s.players.filter((p) => p.team === 'B').length;
    if (s.players.some((p) => p.team === null)) return 'Herkes bir takım seçmeli.';
    if (a < MIN_PLAYERS_PER_TEAM || b < MIN_PLAYERS_PER_TEAM) return `Her takımda en az ${MIN_PLAYERS_PER_TEAM} oyuncu olmalı.`;
    const waiting = s.players.filter((p) => p.connected && !p.ready).length;
    return waiting > 0 ? `${waiting} oyuncu hazır olmayı bekliyor.` : null;
  });
}

function ReadyBar() {
  const self = useSelf();
  const hint = useLobbyHint();
  const ready = self?.ready ?? false;
  return (
    <Card>
      <div className="stack">
        <Button
          variant={ready ? 'default' : 'success'}
          size="lg"
          block
          disabled={!self || self.team === null}
          onClick={() => sendAction({ t: 'lobby:setReady', ready: !ready })}
        >
          {ready ? 'Hazır değilim' : 'Hazırım'}
        </Button>
        {self?.team === null ? <span className="muted">Hazır olmak için önce takım seç.</span> : null}
        {hint ? <span className="muted">{hint}</span> : null}
      </div>
    </Card>
  );
}
