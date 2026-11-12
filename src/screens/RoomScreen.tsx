import { useEffect, useState } from 'react';
import { BOARD_STEPS } from '@shared/board';
import { sanitizeName } from '@shared/validation';
import type { StepKind, TeamId } from '@shared/types';
import { Badge, Button, Card, ModeTag, PlayerChip, Screen, Spinner, TextInput } from '../components/ui';
import { getSavedName, saveName } from '../lib/identity';
import { navigate } from '../lib/router';
import { connectRoom, leaveRoom } from '../net/connection';
import { useGameStore } from '../store/gameStore';
import { useConnectionStatus, useNotice, useTeamPlayers } from '../store/selectors';
import './screens.css';

export function RoomScreen({ code }: { code: string }) {
  const [name, setName] = useState(getSavedName);
  const [confirmedName, setConfirmedName] = useState(() => sanitizeName(getSavedName()));

  // Bağlantının yaşam döngüsü bu ekrana bağlı: unmount'ta soket ve tüm zamanlayıcılar kapanır.
  useEffect(() => {
    if (!confirmedName) return;
    return connectRoom(code, confirmedName);
  }, [code, confirmedName]);

  if (!confirmedName) {
    const clean = sanitizeName(name);
    return (
      <Screen center>
        <Card title={`${code} odasına katıl`}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (!clean) return;
              saveName(clean);
              setConfirmedName(clean);
            }}
          >
            <TextInput label="İsmin" value={name} maxLength={16} autoFocus onChange={(e) => setName(e.target.value)} />
            <Button type="submit" variant="primary" block disabled={!clean}>
              Katıl
            </Button>
          </form>
        </Card>
      </Screen>
    );
  }

  return <RoomView code={code} />;
}

function RoomView({ code }: { code: string }) {
  const status = useConnectionStatus();
  const notice = useNotice();
  const hasSnapshot = useGameStore((s) => s.hasSnapshot);

  const onLeave = () => {
    leaveRoom();
    navigate({ name: 'home' });
  };

  return (
    <Screen
      header={
        <>
          <div>
            <div className="muted" style={{ fontSize: 12, fontWeight: 800 }}>
              ODA KODU
            </div>
            <button
              className="room-code"
              title="Kopyala"
              onClick={() => void navigator.clipboard?.writeText(`${location.origin}/r/${code}`)}
            >
              {code}
            </button>
          </div>
          <div className="row">
            <ConnectionBadge status={status} />
            <Button size="sm" variant="ghost" onClick={onLeave}>
              Çık
            </Button>
          </div>
        </>
      }
    >
      {notice ? <div className="notice">{notice}</div> : null}

      {!hasSnapshot ? (
        status === 'closed' ? (
          <Button onClick={() => navigate({ name: 'home' })}>Ana sayfaya dön</Button>
        ) : (
          <div className="row" style={{ justifyContent: 'center', padding: 32 }}>
            <Spinner label="Odaya bağlanılıyor" />
          </div>
        )
      ) : (
        <>
          <div className="teams">
            <TeamCard team="A" />
            <TeamCard team="B" />
          </div>
          <UnassignedCard />
          <BoardPreview />
          <p className="muted" style={{ textAlign: 'center', fontSize: 14 }}>
            Takım seçimi ve “Hazır” akışı bir sonraki adımda (Task 3) eklenecek.
          </p>
        </>
      )}
    </Screen>
  );
}

function ConnectionBadge({ status }: { status: ReturnType<typeof useConnectionStatus> }) {
  if (status === 'open') return <Badge tone="success" dot>Bağlı</Badge>;
  if (status === 'closed') return <Badge tone="danger" dot>Kapalı</Badge>;
  return (
    <Badge tone="warning" dot>
      {status === 'reconnecting' ? 'Yeniden bağlanıyor' : 'Bağlanıyor'}
    </Badge>
  );
}

const TEAM_TITLES: Record<TeamId, string> = { A: 'Takım A · Kırmızı', B: 'Takım B · Mavi' };

function TeamCard({ team }: { team: TeamId }) {
  const players = useTeamPlayers(team);
  const selfId = useGameStore((s) => s.selfId);
  return (
    <Card team={team} title={TEAM_TITLES[team]}>
      <div className="stack">
        {players.length === 0 ? <span className="muted">Henüz kimse yok</span> : null}
        {players.map((p) => (
          <PlayerChip key={p.id} player={p} isSelf={p.id === selfId} />
        ))}
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

const CELL_COLOR: Record<StepKind, string> = {
  anlatma: 'var(--mode-anlatma)',
  cizme: 'var(--mode-cizme)',
  kukla: 'var(--mode-kukla)',
  onbes: 'var(--mode-onbes)',
  karisik: 'var(--mode-karisik)',
};

/** 45 basamaklı tahtanın renk kodlu önizlemesi (asıl tahta Task 4'te). */
function BoardPreview() {
  return (
    <Card title="Oyun Tahtası">
      <div className="board-strip">
        {BOARD_STEPS.map((kind, i) => (
          <div key={i} className="board-strip__cell" style={{ ['--cell' as string]: CELL_COLOR[kind] }}>
            {i + 1}
          </div>
        ))}
      </div>
      <div className="legend">
        {(['anlatma', 'cizme', 'kukla', 'onbes', 'karisik'] as const).map((k) => (
          <ModeTag key={k} kind={k} />
        ))}
      </div>
    </Card>
  );
}
