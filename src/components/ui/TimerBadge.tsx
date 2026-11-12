import { memo } from 'react';
import { useServerCountdown } from '../../hooks/useServerCountdown';
import { cx } from './cx';

/**
 * Sağ üst köşedeki geri sayım. Kendi state'ini tutar; saniyede bir yalnızca
 * bu küçük bileşen render olur, ekranın geri kalanı etkilenmez.
 */
export const TimerBadge = memo(function TimerBadge({ endsAt, totalSec }: { endsAt: number | null; totalSec: number }) {
  const left = useServerCountdown(endsAt);
  const shown = left ?? totalSec;
  const mm = Math.floor(shown / 60);
  const ss = String(shown % 60).padStart(2, '0');
  return (
    <div
      className={cx('timer', left !== null && left <= 10 && 'timer--critical', left !== null && left > 10 && left <= 20 && 'timer--warn')}
      role="timer"
      aria-live="off"
    >
      {mm}:{ss}
    </div>
  );
});
