import { memo } from 'react';
import type { Player } from '@shared/types';
import { Badge } from './Badge';
import { cx } from './cx';

export const PlayerChip = memo(function PlayerChip({ player, isSelf }: { player: Player; isSelf?: boolean }) {
  const initial = player.name.trim().charAt(0).toLocaleUpperCase('tr-TR') || '?';
  return (
    <div className={cx('player-chip', !player.connected && 'player-chip--offline')}>
      <span className={cx('player-chip__avatar', player.team && `player-chip__avatar--${player.team}`)} aria-hidden>
        {initial}
      </span>
      <span className="player-chip__name">
        {player.name}
        {isSelf ? <span className="muted"> (sen)</span> : null}
      </span>
      <span className="player-chip__tags">
        {player.isHost ? <Badge>Kurucu</Badge> : null}
        {player.ready ? <Badge tone="success">Hazır</Badge> : null}
        {!player.connected ? <Badge tone="warning">Bağlantı yok</Badge> : null}
      </span>
    </div>
  );
});
