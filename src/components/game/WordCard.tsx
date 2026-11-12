import { memo } from 'react';
import type { TabuCard, TripleCard } from '@shared/types';
import { cx } from '../ui';
import './game.css';

/** Anlatma kartı: ana kelime + 5 yasaklı kelime. `key` kelimeye bağlı, kart değişince animasyon çalışır. */
export const TabuCardView = memo(function TabuCardView({ card, onToggle }: { card: TabuCard; onToggle?: (index: number) => void }) {
  return (
    <div className="word-card" key={card.word}>
      <div className="word-card__main">{card.word}</div>
      <ul className="word-card__forbidden">
        {card.forbidden.map((w, i) => {
          const hit = card.hit[i] === true;
          return (
            <li key={w} className={cx(hit && 'forbidden--hit')}>
              {onToggle ? (
                <button
                  type="button"
                  className="forbidden__btn"
                  aria-pressed={hit}
                  onClick={() => {
                    navigator.vibrate?.(15);
                    onToggle(i);
                  }}
                >
                  {w}
                </button>
              ) : (
                w
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
});

interface TripleCardViewProps {
  card: TripleCard;
  /** Verilirse her kelimenin sağında dokunulabilir tik kutusu çıkar (Gözlemci). */
  onTick?: (index: number) => void;
}

/** 3 kelimelik kart. Gözlemci tik atar; Anlatıcı bilinenleri salt okunur görür. */
export const TripleCardView = memo(function TripleCardView({ card, onTick }: TripleCardViewProps) {
  return (
    <div className="triple-card" key={card.words.join('|')}>
      {card.words.map((word, i) => {
        const solved = card.solved[i] === true;
        return (
          <div key={word} className={cx('triple-word', solved && 'triple-word--solved')}>
            <span className="triple-word__text">{word}</span>
            {onTick ? (
              <button
                type="button"
                className={cx('tick', solved && 'tick--on')}
                aria-label={solved ? `${word} bilindi, geri almak için dokun` : `${word} bilindi`}
                aria-pressed={solved}
                onClick={() => {
                  navigator.vibrate?.(15);
                  onTick(i);
                }}
              >
                {solved ? '✓' : ''}
              </button>
            ) : solved ? (
              <span className="tick tick--on tick--static" aria-hidden>
                ✓
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
});
