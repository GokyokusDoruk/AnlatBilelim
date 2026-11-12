/**
 * Türkçe kelime havuzu (shared/data/words_tr.json). Kaynak dosyalar `scripts/words_src_*.txt`;
 * JSON `npm run words:build` ile üretilir. Sadece Worker bu dosyayı içe aktarır, istemci
 * paketine girmez (kartlar sunucudan gelir), böylece istemci bundle'ı küçük kalır.
 */
import data from './data/words_tr.json';
import type { GameMode, KuklaCard, TabuCard, TripleCard, WordLevel } from './types';

export interface WordPool {
  /** Her mod için 4 seviye (index 0 = Seviye 1). */
  readonly anlatma: readonly (readonly { word: string; forbidden: readonly string[] }[])[];
  readonly cizme: readonly (readonly string[])[];
  /** Kukla: kelime + oynatılacak hareket klibinin index'i (`KUKLA_CLIPS`). */
  readonly kukla: readonly (readonly { word: string; clip: number }[])[];
  readonly onbes: readonly (readonly string[])[];
}

export const WORDS: WordPool = data;

export function poolSize(mode: GameMode, level: WordLevel): number {
  return WORDS[mode][level - 1]!.length;
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

/** Bir oda için mod ve seviye bazlı deste: kart üretir, tekrarlamaz. */
export class CardDeck {
  private readonly bags = new Map<string, ShuffleBag>();

  constructor(private readonly rand?: () => number) {}

  private bag(mode: GameMode, level: WordLevel): ShuffleBag {
    const key = `${mode}:${level}`;
    let b = this.bags.get(key);
    if (!b) this.bags.set(key, (b = new ShuffleBag(poolSize(mode, level), this.rand)));
    return b;
  }

  tabuCard(level: WordLevel = 1): TabuCard {
    const entry = WORDS.anlatma[level - 1]![this.bag('anlatma', level).next()]!;
    return { kind: 'tabu', word: entry.word, forbidden: entry.forbidden as TabuCard['forbidden'], hit: [false, false, false, false, false] };
  }

  /** Kukla: seviyeye ait kelimeden tek kelimelik kart (tekrarsız); animasyon seviyesi kelime seviyesiyle aynıdır. */
  kuklaCard(level: WordLevel = 1): KuklaCard {
    const entry = WORDS.kukla[level - 1]![this.bag('kukla', level).next()]!;
    return { kind: 'kukla', word: entry.word, clip: entry.clip, level };
  }

  /** 3 farklı kelimelik kart (Çizme / 15 Kelime). */
  tripleCard(mode: Exclude<GameMode, 'anlatma' | 'kukla'>, level: WordLevel = 1): TripleCard {
    const bag = this.bag(mode, level);
    const list = WORDS[mode][level - 1]!;
    return {
      kind: 'triple',
      words: [list[bag.next()]!, list[bag.next()]!, list[bag.next()]!],
      solved: [false, false, false],
    };
  }
}
