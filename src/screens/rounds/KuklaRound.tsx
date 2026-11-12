import { lazy, Suspense } from 'react';
import { canPass, passesLeft } from '@shared/board';
import type { Role, RoundPublicState } from '@shared/types';
import { ActionButton } from '../../components/game/ActionButton';
import { ScorePill } from '../../components/game/Meters';
import { Spinner } from '../../components/ui';
import { sendAction } from '../../net/connection';
import { useGameStore } from '../../store/gameStore';
import { ListenerView, PassLine, RoundShell } from './parts';

// Three.js yalnızca Kukla turunda indirilir.
const KuklaStage = lazy(() => import('../../components/kukla/KuklaStage'));

/**
 * Kukla: kelimenin animasyonu 10 sn'lik döngüyle herkeste oynar. Gözlemci kelimeyi görür ve "Bildi"ye basar;
 * Anlatıcı kelimeyi görür ve takım anlamazsa Pass der (3 hak). Dinleyiciler yalnızca animasyonu izler.
 */
export function KuklaRound({ round, role }: { round: RoundPublicState; role: Role }) {
  const card = useGameStore((s) => (s.privateData?.card?.kind === 'kukla' ? s.privateData.card : null));
  const stage = (
    <Suspense fallback={<Spinner label="Kukla yükleniyor" />}>
      <KuklaStage anim={round.anim} />
    </Suspense>
  );

  if (role === 'listener') {
    return (
      <RoundShell round={round} role={role}>
        <ListenerView round={round}>{stage}</ListenerView>
      </RoundShell>
    );
  }

  return (
    <RoundShell round={round} role={role}>
      {stage}
      <div className="word-card" key={card?.word ?? 'loading'}>
        <div className="word-card__main">{card ? card.word : '…'}</div>
      </div>
      {role === 'observer' ? (
        <>
          <ActionButton variant="primary" size="lg" block disabled={!card} onClick={() => sendAction({ t: 'round:correct' })}>
            Bildi (+1)
          </ActionButton>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <ScorePill label="Bilinen" value={round.correct} />
            <PassLine round={round} />
          </div>
        </>
      ) : (
        <div className="round__actions">
          <ActionButton
            variant="primary"
            size="lg"
            block
            disabled={!canPass(round.mode, round.passesUsed, card)}
            onClick={() => sendAction({ t: 'round:pass' })}
          >
            Pass ({passesLeft(round.mode, round.passesUsed)} hak kaldı)
          </ActionButton>
          <PassLine round={round} />
        </div>
      )}
    </RoundShell>
  );
}
