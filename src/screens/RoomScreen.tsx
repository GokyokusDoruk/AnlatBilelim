import { useEffect, useState } from 'react';
import { sanitizeName } from '@shared/validation';
import { Board } from '../components/board/Board';
import { Badge, Button, Card, Screen, Spinner, TextInput } from '../components/ui';
import { getSavedName, saveName } from '../lib/identity';
import { navigate } from '../lib/router';
import { connectRoom, leaveRoom } from '../net/connection';
import { useGameStore } from '../store/gameStore';
import { useConnectionStatus, useFocusMode, useNotice, usePhase } from '../store/selectors';
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
  const focus = useFocusMode();

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
          {/* Tur sırasında sağ üstteki sabit sayaç bağlantı rozetini kapatmasın */}
          <div className="row" style={{ marginRight: phase === 'round' ? 88 : 0 }}>
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
          {focus ? null : (
            <Card title="Oyun Tahtası">
              <Board />
            </Card>
          )}
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
