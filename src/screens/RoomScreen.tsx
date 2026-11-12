import { useEffect, useState } from 'react';
import { BOARD_STEPS } from '@shared/board';
import { sanitizeName } from '@shared/validation';
import type { StepKind } from '@shared/types';
import { Badge, Button, Card, ModeTag, Screen, Spinner, TextInput } from '../components/ui';
import { getSavedName, saveName } from '../lib/identity';
import { navigate } from '../lib/router';
import { connectRoom, leaveRoom } from '../net/connection';
import { useGameStore } from '../store/gameStore';
import { useConnectionStatus, useNotice, usePhase } from '../store/selectors';
import { GameStatusView } from './GameStatusView';
import { LobbyView } from './LobbyView';
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
  const phase = usePhase();

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
          {phase === 'lobby' ? <LobbyView /> : <GameStatusView />}
          <BoardPreview />
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
