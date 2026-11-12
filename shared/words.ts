/**
 * Türkçe kelime havuzu (shared/data/words_tr.json). Kaynak dosyalar `scripts/words_src_*.txt`;
 * JSON `npm run words:build` ile üretilir. Sadece Worker bu dosyayı içe aktarır, istemci
 * paketine girmez (kartlar sunucudan gelir), böylece istemci bundle'ı küçük kalır.
 */
import data from './data/words_tr.json';
import type { GameMode, TabuCard, TripleCard } from './types';

export interface WordPool {
  readonly anlatma: readonly { word: string; forbidden: readonly string[] }[];
  readonly cizme: readonly string[];
  readonly kukla: readonly string[];
  readonly onbes: readonly string[];
}

export const WORDS: WordPool = data;

/** Moda göre tek kelimelik havuz (Anlatma hariç). */
export function wordList(mode: Exclude<GameMode, 'anlatma'>): readonly string[] {
  return WORDS[mode];
}

export function poolSize(mode: GameMode): number {
  return WORDS[mode].length;
}

/**
 * Tekrarsız çekiliş: havuz tükenene kadar aynı öğe gelmez, tükenince yeniden karılır.
 * Sadece index dizisi tutar (Uint16Array), kelimeleri kopyalamaz; oda başına birkaç yüz bayt.
 * `rand` enjekte edilebilir (test için); varsayılan crypto tabanlıdır.
 */
export class ShuffleBag {
  private order: Uint16Array;
  private cursor = 0;

  constructor(
    private readonly size: number,
    private readonly rand: () => number = secureRandom,
  ) {
    this.order = new Uint16Array(size);
    this.refill();
  }

  next(): number {
    if (this.cursor >= this.size) this.refill();
    return this.order[this.cursor++]!;
  }

  private refill(): void {
    for (let i = 0; i < this.size; i++) this.order[i] = i;
    for (let i = this.size - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      const tmp = this.order[i]!;
      this.order[i] = this.order[j]!;
      this.order[j] = tmp;
    }
    this.cursor = 0;
  }
}

function secureRandom(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! / 0x1_0000_0000;
}

/** Bir oda için mod bazlı deste: kart üretir, tekrarlamaz. */
export class CardDeck {
  private readonly bags = new Map<GameMode, ShuffleBag>();

  constructor(private readonly rand?: () => number) {}

  private bag(mode: GameMode): ShuffleBag {
    let b = this.bags.get(mode);
    if (!b) this.bags.set(mode, (b = new ShuffleBag(poolSize(mode), this.rand)));
    return b;
  }

  tabuCard(): TabuCard {
    const entry = WORDS.anlatma[this.bag('anlatma').next()]!;
    return { kind: 'tabu', word: entry.word, forbidden: entry.forbidden as TabuCard['forbidden'] };
  }

  /** 3 farklı kelimelik kart (Çizme / Kukla / 15 Kelime). */
  tripleCard(mode: Exclude<GameMode, 'anlatma'>): TripleCard {
    const bag = this.bag(mode);
    const list = WORDS[mode];
    return {
      kind: 'triple',
      words: [list[bag.next()]!, list[bag.next()]!, list[bag.next()]!],
      solved: [false, false, false],
    };
  }
}
