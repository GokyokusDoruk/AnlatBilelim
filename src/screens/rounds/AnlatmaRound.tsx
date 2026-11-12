import { canPass, passCost, passesLeft } from '@shared/board';
import type { Role, RoundPublicState, TabuCard } from '@shared/types';
import { ActionButton } from '../../components/game/ActionButton';
import { ScorePill } from '../../components/game/Meters';
import { TabuCardView } from '../../components/game/WordCard';
import { Spinner } from '../../components/ui';
import { sendAction } from '../../net/connection';
import { useGameStore } from '../../store/gameStore';
import { ListenerView, PassLine, RoundShell } from './parts';

/** Anlatma modu (60 sn): 1 kelime + 5 yasaklı, 3 pass. */
export function AnlatmaRound({ round, role }: { round: RoundPublicState; role: Role }) {
  const card = useGameStore((s) => (s.privateData?.card?.kind === 'tabu' ? s.privateData.card : null));

  if (role === 'listener') {
    return (
      <RoundShell round={round} role={role}>
        <ListenerView round={round} />
      </RoundShell>
    );
  }
  return (
    <RoundShell round={round} role={role}>
      {card ? (
        <TabuCardView card={card} onToggle={role === 'observer' ? (index) => sendAction({ t: 'round:forbidden', index }) : undefined} />
      ) : <Spinner label="Kart yükleniyor" />}
      {role === 'narrator' ? <NarratorControls round={round} card={card} /> : <ObserverControls round={round} card={card} />}
    </RoundShell>
  );
}

function NarratorControls({ round, card }: { round: RoundPublicState; card: TabuCard | null }) {
  const left = passesLeft(round.mode, round.passesUsed);
  return (
    <div className="round__actions">
      <ActionButton
        variant="primary"
        size="lg"
        block
        disabled={!canPass(round.mode, round.passesUsed, card)}
        onClick={() => sendAction({ t: 'round:pass' })}
      >
        Pass ({left} hak kaldı)
      </ActionButton>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <PassLine round={round} />
        {card ? <span className="muted" style={{ fontSize: 13 }}>Pass maliyeti: {passCost(card)}</span> : null}
      </div>
    </div>
  );
}

function ObserverControls({ round, card }: { round: RoundPublicState; card: TabuCard | null }) {
  const burned = card?.hit.some(Boolean) === true;
  return (
    <>
      <div className="round__actions round__actions--two">
        <ActionButton variant="success" size="lg" onClick={() => sendAction({ t: 'round:correct' })}>
          Doğru Bilindi (+1)
        </ActionButton>
        <ActionButton variant="danger" size="lg" onClick={() => sendAction({ t: 'round:forbidden' })}>
          {burned ? 'Kart Yandı, Sonraki' : 'Yasaklı Kelime (−1)'}
        </ActionButton>
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <ScorePill label="Tur skoru" value={round.correct - round.forbiddenHits} />
        <PassLine round={round} />
      </div>
    </>
  );
}
