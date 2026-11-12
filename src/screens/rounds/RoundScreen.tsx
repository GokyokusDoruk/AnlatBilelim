import { useMyRole, useRound } from '../../store/selectors';
import { AnlatmaRound } from './AnlatmaRound';
import { TripleRound } from './TripleRound';

/** Aktif tur: moda ve role göre ilgili ekranı seçer. */
export function RoundScreen() {
  const round = useRound();
  const role = useMyRole();
  if (!round || !role) return null;
  return round.mode === 'anlatma' ? <AnlatmaRound round={round} role={role} /> : <TripleRound round={round} role={role} />;
}
