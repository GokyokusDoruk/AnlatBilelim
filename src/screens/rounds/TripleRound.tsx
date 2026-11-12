import { canPass, MODE_CONFIG, passCost, passesLeft } from '@shared/board';
import type { Role, RoundPublicState, TripleCard } from '@shared/types';
import { ActionButton } from '../../components/game/ActionButton';
import { ClueCounter, ScorePill } from '../../components/game/Meters';
import { TripleCardView } from '../../components/game/WordCard';
import { Spinner } from '../../components/ui';
import { sendAction } from '../../net/connection';
import { useGameStore } from '../../store/gameStore';
import { ListenerDraw } from '../../components/draw/ListenerDraw';
import { NarratorDraw } from '../../components/draw/NarratorDraw';
import { ListenerView, PassLine, RoundShell } from './parts';

const CLUE_TOTAL = MODE_CONFIG.onbes.clueLimit ?? 15;

/**
 * 3 kelimelik kart modları (Çizme, Kukla, 15 Kelime). Kart, tik ve pass mantığı ortaktır;
 * Çizme tuvali (Task 6) ve Kukla sahnesi (Task 7) Anlatıcı/Dinleyici ekranına bu çerçeveden eklenir.
 */
export function TripleRound({ round, role }: { round: RoundPublicState; role: Role }) {
  const card = useGameStore((s) => (s.privateData?.card?.kind === 'triple' ? s.privateData.card : null));
  const isClueMode = round.cluesLeft !== null;

  if (role === 'listener') {
    return (
      <RoundShell round={round} role={role}>
        <ListenerView round={round}>
          {isClueMode ? <ClueCounter left={round.cluesLeft!} total={CLUE_TOTAL} /> : null}
          {round.mode === 'cizme' ? <ListenerDraw /> : null}
        </ListenerView>
      </RoundShell>
    );
  }

  // Çizme modunda Anlatıcı kelimeler + tuval görür; Gözlemci yalnızca 3 kelimelik kartı.
  if (round.mode === 'cizme' && role === 'narrator') {
    return (
      <RoundShell round={round} role={role}>
        {card ? <NarratorDraw round={round} card={card} /> : <Spinner label="Kart yükleniyor" />}
      </RoundShell>
    );
  }

  return (
    <RoundShell round={round} role={role}>
      {isClueMode ? <ClueCounter left={round.cluesLeft!} total={CLUE_TOTAL} /> : null}
      {card ? (
        <TripleCardView card={card} onTick={role === 'observer' ? (index) => sendAction({ t: 'round:correct', index }) : undefined} />
      ) : (
        <Spinner label="Kart yükleniyor" />
      )}
      {role === 'narrator' ? <NarratorControls round={round} card={card} /> : <ObserverControls round={round} isClueMode={isClueMode} />}
    </RoundShell>
  );
}

function NarratorControls({ round, card }: { round: RoundPublicState; card: TripleCard | null }) {
  const left = passesLeft(round.mode, round.passesUsed);
  const cost = card ? passCost(card) : 0;
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
        {card ? (
          <span className="muted" style={{ fontSize: 13 }}>
            Pass {cost} hak düşer{left < cost ? ' (yetmiyor)' : ''}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ObserverControls({ round, isClueMode }: { round: RoundPublicState; isClueMode: boolean }) {
  return (
    <>
      {isClueMode ? (
        <ActionButton variant="danger" size="lg" block onClick={() => sendAction({ t: 'round:clueUsed' })}>
          Kelime Kullanıldı (−1)
        </ActionButton>
      ) : null}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <ScorePill label="Bilinen" value={round.correct} />
        <PassLine round={round} />
      </div>
    </>
  );
}
