import { useMyRole, useRound } from '../../store/selectors';
import { AnlatmaRound } from './AnlatmaRound';
import { KuklaRound } from './KuklaRound';
import { TripleRound } from './TripleRound';

/** Aktif tur: moda ve role göre ilgili ekranı seçer. */
export function RoundScreen() {
  const round = useRound();
  const role = useMyRole();
  if (!round || !role) return null;
  if (round.mode === 'anlatma') return <AnlatmaRound round={round} role={role} />;
  if (round.mode === 'kukla') return <KuklaRound round={round} role={role} />;
  return <TripleRound round={round} role={role} />;
}
