/** Canvas çizimleri CSS değişkenlerini okuyamaz; tokens.css'teki --mode-* ile aynı tutulmalı. */
import type { GameMode } from '@shared/types';

export const MODE_COLORS: Record<GameMode, string> = {
  anlatma: '#ffb020',
  cizme: '#2ed47a',
  kukla: '#c06bff',
  onbes: '#22c3e6',
};
