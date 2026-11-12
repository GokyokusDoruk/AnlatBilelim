/**
 * Kukla animasyonları (Task 7). Her klip, 10 saniyelik döngüde sinüs izlerinden oluşan parametrik
 * bir harekettir: `cyc` tam sayı olduğu için baştan sona kesintisiz loop eder.
 *
 * Kelimeler bu dosyada YOK (istemci paketine girmesin diye); klip index'i ile kelime eşleşmesi
 * sadece sunucudaki `kukla_words.ts` içindedir. Dinleyiciler yalnızca index + seviye + başlangıç
 * zamanı görür, kelimeyi bilemez.
 *
 * Zorluk seviyeleri (1 kolay … 4 zor): hareketin ne kadarının gösterildiğini belirler;
 * kelime asla düz anlatılmaz, seviye yükseldikçe daha dolaylı olur. Zorluk seçimi ileride
 * kelime bazında verilecek; şimdilik tur, kartın `level` alanını taşır (varsayılan 2).
 */

export const KUKLA_LOOP_SEC = 10;
export const KUKLA_LEVELS = [1, 2, 3, 4] as const;
export type KuklaLevel = (typeof KUKLA_LEVELS)[number];

export type Joint = 'hips' | 'spine' | 'head' | 'shL' | 'elL' | 'shR' | 'elR' | 'hpL' | 'knL' | 'hpR' | 'knR';
export const JOINTS: readonly Joint[] = ['hips', 'spine', 'head', 'shL', 'elL', 'shR', 'elR', 'hpL', 'knL', 'hpR', 'knR'];
export type Axis = 0 | 1 | 2; // x, y, z

/** [eklem | 'pos', eksen, genlik, döngüde tekrar sayısı (tam sayı), faz (0..1), taban açı] */
type Track = readonly [Joint | 'pos', Axis, number, number, number?, number?];

export interface KuklaClip {
  readonly tracks: readonly Track[];
  /** Hareketi en iyi anlatan eklemler (yüksek seviyede yalnızca bunlar kalır). */
  readonly key: readonly (Joint | 'pos')[];
}

export type Pose = {
  readonly rot: Record<Joint, [number, number, number]>;
  readonly pos: [number, number, number];
  /** Zorluk 3-4: gövde siluet olarak çizilir. */
  readonly silhouette: boolean;
};

const X = 0, Y = 1, Z = 2;
const sw = (j: Joint, amp: number, cyc: number, ph = 0, base = 0): Track => [j, X, amp, cyc, ph, base];

/** İki kol / iki bacak ters fazda sallanır. */
const arms = (amp: number, cyc: number): Track[] => [sw('shL', amp, cyc, 0), sw('shR', amp, cyc, 0.5)];
const legs = (amp: number, cyc: number): Track[] => [sw('hpL', amp, cyc, 0), sw('hpR', amp, cyc, 0.5)];
const bounce = (amp: number, cyc: number): Track => ['pos', Y, amp, cyc, 0.25];

/** Parçalar tek Track ya da Track dizisi olabilir; Track'in kendisi dizi olduğundan elle ayrıştırılır. */
const C = (key: (Joint | 'pos')[], ...parts: (Track | Track[])[]): KuklaClip => ({
  key,
  tracks: parts.flatMap((p) => (typeof p[0] === 'string' ? [p as Track] : (p as Track[]))),
});

/** Sıra, `kukla_words.ts` ile birebir aynıdır. */
export const KUKLA_CLIPS: readonly KuklaClip[] = [
  // 0 koşmak
  C(['hpL', 'hpR', 'shL', 'shR'], legs(1, 20), [sw('knL', 0.5, 20, 0.25, 0.7), sw('knR', 0.5, 20, 0.75, 0.7)], arms(0.9, 20), bounce(0.06, 40), [sw('elL', 0, 1, 0, -1.3), sw('elR', 0, 1, 0, -1.3)]),
  // 1 zıplamak
  C(['hpL', 'hpR', 'pos'], ['pos', Y, 0.35, 5, 0.25], [sw('hpL', 0.5, 5, 0, -0.2), sw('hpR', 0.5, 5, 0, -0.2), sw('knL', 0.6, 5, 0, 0.4), sw('knR', 0.6, 5, 0, 0.4)], [['shL', Z, 0.9, 5, 0, 1.2], ['shR', Z, -0.9, 5, 0, -1.2]]),
  // 2 yüzmek
  C(['shL', 'shR'], [sw('spine', 0, 1, 0, 1.2)], [sw('shL', 3, 4, 0), sw('shR', 3, 4, 0.5)], [sw('hpL', 0.3, 8), sw('hpR', 0.3, 8, 0.5)], bounce(0.03, 8)),
  // 3 dans etmek
  C(['hips', 'shL', 'shR'], [['hips', Y, 0.5, 5], ['shL', Z, 0.6, 5, 0, 1.5], ['shR', Z, -0.6, 5, 0.5, -1.5], sw('hpL', 0.4, 10), sw('hpR', 0.4, 10, 0.5)], bounce(0.04, 10)),
  // 4 uyumak
  C(['hips', 'spine'], [['hips', Z, 0, 1, 0, 1.55], ['pos', Y, 0.02, 3, 0, -0.55], sw('spine', 0.03, 3)], [sw('shL', 0, 1, 0, -0.1), sw('head', 0.05, 3)]),
  // 5 yemek yemek
  C(['shR', 'elR', 'head'], [sw('shR', 0.5, 5, 0, -0.9), sw('elR', 0.9, 5, 0, -1.4), sw('head', 0.2, 5, 0.25)]),
  // 6 su içmek
  C(['shR', 'elR', 'head'], [sw('shR', 0.2, 2, 0, -1.2), sw('elR', 0.3, 2, 0, -1.8), sw('head', 0.35, 2, 0.5, -0.1)]),
  // 7 ağlamak
  C(['shL', 'elL', 'shR', 'elR', 'spine'], [sw('shL', 0.15, 10, 0, -1.2), sw('elL', 0.1, 10, 0, -2.2), sw('shR', 0.15, 10, 0.2, -1.2), sw('elR', 0.1, 10, 0, -2.2), sw('spine', 0.1, 10), sw('head', 0.2, 2, 0, 0.4)]),
  // 8 gülmek
  C(['spine', 'head'], [sw('spine', 0.18, 20, 0, 0.1), sw('head', 0.3, 20, 0, -0.3), ['shL', Z, 0.2, 20, 0, 0.5], ['shR', Z, -0.2, 20, 0, -0.5], bounce(0.025, 20)]),
  // 9 öksürmek
  C(['spine', 'shR', 'elR'], [sw('shR', 0, 1, 0, -1.2), sw('elR', 0, 1, 0, -2.3), sw('spine', 0.3, 10, 0, 0.1), sw('head', 0.2, 10)]),
  // 10 hapşırmak
  C(['spine', 'head'], [sw('head', 0.7, 2, 0, -0.2), sw('spine', 0.5, 2, 0.1, 0.05), ['pos', Y, 0.03, 4, 0.25]]),
  // 11 esnemek
  C(['shL', 'shR', 'spine'], [['shL', Z, 0.5, 2, 0.25, 1.9], ['shR', Z, -0.5, 2, 0.25, -1.9], sw('spine', 0.2, 2, 0.75, -0.1), sw('head', 0.3, 2, 0.75, -0.2)]),
  // 12 el sallamak
  C(['shR', 'elR'], [['shR', Z, 0.2, 1, 0, -2.6], ['elR', Z, 0.6, 10, 0, -0.3], sw('head', 0.05, 5)]),
  // 13 alkışlamak
  C(['shL', 'shR', 'elL', 'elR'], [sw('shL', 0.05, 15, 0, -1.2), sw('shR', 0.05, 15, 0, -1.2), ['shL', Z, 0.35, 15, 0, -0.1], ['shR', Z, -0.35, 15, 0, 0.1], sw('elL', 0.2, 15, 0, -0.9), sw('elR', 0.2, 15, 0, -0.9)]),
  // 14 sarılmak
  C(['shL', 'shR', 'spine'], [sw('shL', 0.2, 2, 0, -1.4), sw('shR', 0.2, 2, 0, -1.4), ['shL', Z, 0.3, 2, 0, -0.6], ['shR', Z, -0.3, 2, 0, 0.6], sw('elL', 0.4, 2, 0, -1.2), sw('elR', 0.4, 2, 0, -1.2), sw('spine', 0.1, 2)]),
  // 15 kavga etmek
  C(['shL', 'shR', 'hips'], [sw('shL', 1, 10, 0, -1), sw('shR', 1, 10, 0.5, -1), sw('elL', 0.8, 10, 0, -1.2), sw('elR', 0.8, 10, 0.5, -1.2), ['hips', Y, 0.4, 5], bounce(0.04, 10)]),
  // 16 boks yapmak
  C(['shL', 'shR', 'elL', 'elR'], [sw('shL', 0.2, 10, 0, -1.4), sw('shR', 0.2, 10, 0.5, -1.4), sw('elL', 0.9, 10, 0, -1.3), sw('elR', 0.9, 10, 0.5, -1.3), ['hips', Y, 0.2, 10], bounce(0.03, 20)]),
  // 17 futbol oynamak (şut)
  C(['hpR', 'knR'], [sw('hpR', 1, 5, 0, -0.1), sw('knR', 0.9, 5, 0.25, 0.4), sw('shL', 0.5, 5, 0.5), sw('shR', 0.5, 5, 0), bounce(0.02, 5)]),
  // 18 bisiklete binmek
  C(['hpL', 'hpR', 'knL', 'knR'], [sw('hpL', 0.7, 10, 0, -0.9), sw('hpR', 0.7, 10, 0.5, -0.9), sw('knL', 0.7, 10, 0.25, 0.9), sw('knR', 0.7, 10, 0.75, 0.9), sw('shL', 0, 1, 0, -1.2), sw('shR', 0, 1, 0, -1.2), sw('spine', 0, 1, 0, 0.25)]),
  // 19 kürek çekmek
  C(['shL', 'shR', 'spine'], [sw('shL', 0.7, 5, 0, -1.1), sw('shR', 0.7, 5, 0, -1.1), sw('elL', 0.9, 5, 0.25, -0.9), sw('elR', 0.9, 5, 0.25, -0.9), sw('spine', 0.3, 5, 0.1), sw('hpL', 0, 1, 0, -1.4), sw('hpR', 0, 1, 0, -1.4)]),
  // 20 tırmanmak
  C(['shL', 'shR', 'hpL', 'hpR'], [['shL', Z, 0.5, 5, 0, 2.6], ['shR', Z, -0.5, 5, 0.5, -2.6], sw('hpL', 0.7, 5, 0.25, -0.5), sw('hpR', 0.7, 5, 0.75, -0.5), sw('knL', 0.5, 5, 0.25, 0.6), sw('knR', 0.5, 5, 0.75, 0.6), bounce(0.04, 5)]),
  // 21 ip atlamak
  C(['hpL', 'hpR', 'pos'], [['pos', Y, 0.18, 10, 0.25], sw('knL', 0.5, 10, 0, 0.4), sw('knR', 0.5, 10, 0, 0.4), ['shL', Z, 0.15, 10, 0, 0.35], ['shR', Z, -0.15, 10, 0, -0.35], sw('elL', 0.6, 10, 0.5, -0.8), sw('elR', 0.6, 10, 0.5, -0.8)]),
  // 22 olta atmak
  C(['shR', 'elR', 'spine'], [sw('shR', 1.1, 2, 0, -1.6), sw('elR', 0.6, 2, 0.1, -0.5), sw('spine', 0.2, 2, 0.1), sw('shL', 0.2, 2, 0, -0.8)]),
  // 23 halter kaldırmak
  C(['shL', 'shR', 'elL', 'elR', 'knL', 'knR'], [['shL', Z, 1, 2, 0, 1.3], ['shR', Z, -1, 2, 0, -1.3], sw('elL', 1, 2, 0, -1.1), sw('elR', 1, 2, 0, -1.1), sw('knL', 0.5, 2, 0.5, 0.3), sw('knR', 0.5, 2, 0.5, 0.3), ['pos', Y, 0.08, 2, 0.5]]),
  // 24 gitar çalmak
  C(['shL', 'shR', 'elR'], [sw('shL', 0.25, 2, 0, -1), sw('elL', 0.2, 2, 0, -1.5), sw('shR', 0.2, 20, 0, -0.9), sw('elR', 0.5, 20, 0, -1.2), sw('head', 0.1, 5), ['hips', Y, 0.12, 5]]),
  // 25 davul çalmak
  C(['shL', 'shR', 'elL', 'elR'], [sw('shL', 0.2, 10, 0, -1.2), sw('shR', 0.2, 10, 0.5, -1.2), sw('elL', 0.8, 10, 0, -1.2), sw('elR', 0.8, 10, 0.5, -1.2), sw('hpL', 0.2, 5, 0, -1.2), sw('hpR', 0.2, 5, 0.5, -1.2), sw('head', 0.1, 10)]),
  // 26 diş fırçalamak
  C(['shR', 'elR'], [sw('shR', 0.15, 2, 0, -1.3), sw('elR', 0.4, 25, 0, -2.2), sw('head', 0.05, 25)]),
  // 27 saç taramak
  C(['shR', 'elR'], [['shR', Z, 0.15, 2, 0, -2.4], sw('elR', 0.5, 8, 0, -0.8), ['elR', Z, 0.4, 8, 0.2], sw('head', 0.1, 4)]),
  // 28 çamaşır asmak
  C(['shL', 'shR', 'spine'], [['shL', Z, 0.2, 3, 0, 2.7], ['shR', Z, -0.2, 3, 0.5, -2.7], sw('elL', 0.4, 6, 0, -0.4), sw('elR', 0.4, 6, 0.5, -0.4), sw('spine', 0.15, 3), ['pos', Y, 0.05, 3, 0.25]]),
  // 29 ütü yapmak
  C(['shR', 'elR'], [sw('shR', 0.3, 5, 0, -0.9), sw('elR', 0.5, 10, 0, -1.2), ['pos', X, 0.0, 1], sw('spine', 0.08, 5, 0, 0.2)]),
  // 30 yer silmek
  C(['shL', 'shR', 'spine'], [sw('spine', 0.15, 2, 0, 0.7), sw('shL', 0.5, 5, 0, -0.7), sw('shR', 0.5, 5, 0.5, -0.7), ['hips', Y, 0.25, 5], ['pos', X, 0.12, 5]]),
  // 31 telefonla konuşmak
  C(['shR', 'elR', 'head'], [['shR', Z, 0.05, 1, 0, -0.3], sw('shR', 0, 1, 0, -0.6), sw('elR', 0.1, 5, 0, -2.4), sw('head', 0.1, 5, 0, -0.15), sw('shL', 0.5, 10, 0, -0.4), sw('elL', 0.5, 5, 0.25, -0.5)]),
  // 32 soğuktan titremek
  C(['spine', 'shL', 'shR'], [sw('shL', 0.1, 40, 0, -0.8), sw('shR', 0.1, 40, 0.5, -0.8), sw('elL', 0.1, 40, 0, -2.4), sw('elR', 0.1, 40, 0, -2.4), sw('spine', 0.08, 40, 0, 0.2), sw('knL', 0.15, 40, 0, 0.3), sw('knR', 0.15, 40, 0.5, 0.3), ['pos', X, 0.012, 40]]),
  // 33 korkmak
  C(['shL', 'shR', 'head', 'hips'], [['shL', Z, 0.1, 1, 0, 0.9], ['shR', Z, -0.1, 1, 0, -0.9], sw('elL', 0.25, 20, 0, -1.4), sw('elR', 0.25, 20, 0, -1.4), sw('spine', 0.08, 2, 0, -0.3), sw('head', 0.2, 1, 0.3, -0.2), sw('knL', 0.12, 20, 0, 0.4), sw('knR', 0.12, 20, 0.5, 0.4)]),
  // 34 yorulmak
  C(['spine', 'head', 'shL', 'shR'], [sw('spine', 0.08, 2, 0, 0.5), sw('head', 0.1, 2, 0, 0.4), sw('shL', 0.06, 2, 0, 0.15), sw('shR', 0.06, 2, 0.1, 0.15), sw('knL', 0.05, 2, 0, 0.25), sw('knR', 0.05, 2, 0, 0.25), ['pos', Y, 0.02, 2, 0, -0.04]]),
  // 35 ağaç kesmek
  C(['shL', 'shR', 'elL', 'elR', 'spine'], [sw('shL', 0.9, 5, 0, -1.9), sw('shR', 0.9, 5, 0, -1.9), sw('elL', 0.5, 5, 0.1, -0.5), sw('elR', 0.5, 5, 0.1, -0.5), sw('spine', 0.35, 5, 0.2, 0.15), sw('knL', 0.2, 5, 0, 0.3), sw('knR', 0.2, 5, 0, 0.3)]),
  // 36 çivi çakmak
  C(['shR', 'elR'], [sw('shR', 0.2, 10, 0, -1.4), sw('elR', 0.9, 10, 0, -1.2), sw('shL', 0, 1, 0, -0.9), sw('elL', 0, 1, 0, -1.2), sw('spine', 0.05, 10, 0, 0.15)]),
  // 37 kazı yapmak
  C(['shL', 'shR', 'spine', 'knL'], [sw('spine', 0.55, 5, 0, 0.5), sw('shL', 0.5, 5, 0.1, -0.7), sw('shR', 0.5, 5, 0.1, -0.7), sw('elL', 0.6, 5, 0.3, -0.5), sw('elR', 0.6, 5, 0.3, -0.5), sw('knL', 0.3, 5, 0, 0.4), sw('knR', 0.3, 5, 0, 0.4)]),
  // 38 ok atmak
  C(['shL', 'shR', 'elR'], [['shL', Z, 0, 1, 0, 1.55], sw('shL', 0, 1, 0, -0.1), sw('shR', 0.08, 2, 0, -1.2), ['shR', Z, 0, 1, 0, 0], sw('elR', 1.1, 2, 0, -1.2), ['hips', Y, 0, 1, 0, 1.5]]),
  // 39 top fırlatmak
  C(['shR', 'elR', 'spine'], [sw('shR', 1.4, 2, 0, -1.2), sw('elR', 0.9, 2, 0.1, -0.8), sw('spine', 0.35, 2, 0.1), sw('hpL', 0.3, 2, 0, -0.2), sw('shL', 0.5, 2, 0.5, -0.3)]),
  // 40 fotoğraf çekmek
  C(['shL', 'shR', 'elL', 'elR', 'head'], [sw('shL', 0.05, 5, 0, -1.2), sw('shR', 0.05, 5, 0, -1.2), sw('elL', 0.9, 5, 0, -1.9), sw('elR', 0.9, 5, 0, -1.9), sw('head', 0.1, 5), ['pos', Y, 0.0, 1]]),
  // 41 halay çekmek
  C(['shL', 'shR', 'hpL', 'hpR'], [['shL', Z, 0.15, 5, 0, 1.0], ['shR', Z, -0.15, 5, 0, -1.0], sw('elL', 0.3, 5, 0, -0.5), sw('elR', 0.3, 5, 0, -0.5), sw('hpL', 0.6, 5, 0, -0.3), sw('hpR', 0.6, 5, 0.5, -0.3), sw('knL', 0.5, 5, 0.25, 0.3), sw('knR', 0.5, 5, 0.75, 0.3), ['pos', X, 0.1, 5], bounce(0.04, 10)]),
];

/** Seviye başına kaç tur-eşik: hareket yalnızca döngünün ilk `activeFraction` kısmında oynar. */
const LEVEL_RULES: Record<KuklaLevel, { offKey: number; keyAmp: number; activeFraction: number; silhouette: boolean }> = {
  1: { offKey: 1, keyAmp: 1, activeFraction: 1, silhouette: false },
  2: { offKey: 0.5, keyAmp: 1, activeFraction: 1, silhouette: false },
  3: { offKey: 0, keyAmp: 1, activeFraction: 1, silhouette: true },
  4: { offKey: 0, keyAmp: 0.6, activeFraction: 0.6, silhouette: true },
};

const TAU = Math.PI * 2;

/**
 * `tSec` anındaki poz. Zorluk seviyesi: 1 tüm vücut; 2 anahtar olmayan eklemler yarıya iner;
 * 3 yalnızca anahtar eklemler oynar ve gövde siluet olur; 4 ek olarak hareket kısılır ve
 * döngünün son %40'ında figür durur (ipucu seyrelir).
 */
export function samplePose(clipIndex: number, tSec: number, level: KuklaLevel = 2): Pose {
  const clip = KUKLA_CLIPS[clipIndex % KUKLA_CLIPS.length]!;
  const rules = LEVEL_RULES[level] ?? LEVEL_RULES[2];
  const u = (((tSec % KUKLA_LOOP_SEC) + KUKLA_LOOP_SEC) % KUKLA_LOOP_SEC) / KUKLA_LOOP_SEC;
  const active = u < rules.activeFraction;
  const rot = Object.fromEntries(JOINTS.map((j) => [j, [0, 0, 0] as [number, number, number]])) as Pose['rot'];
  const pos: [number, number, number] = [0, 0, 0];
  for (const [j, axis, amp, cyc, ph = 0, base = 0] of clip.tracks) {
    const isKey = j === 'pos' || clip.key.includes(j);
    const scale = isKey ? rules.keyAmp : rules.offKey;
    const x = TAU * (cyc * u + ph);
    const wave = active ? Math.sin(x) + 0.14 * Math.sin(2 * x + 0.6) : 0; // hafif keskinleştirme: daha organik hareket
    const value = base * (isKey || rules.offKey > 0 ? 1 : 0) + amp * scale * wave;
    if (j === 'pos') pos[axis] += value;
    else rot[j][axis] += value;
  }
  if (active && level <= 2) addLife(rot, pos, u);
  return { rot, pos, silhouette: rules.silhouette };
}

/**
 * Canlılık katmanı (Seviye 1-2): her klibin üstüne nefes alma, ağırlık verme, baş ve kol salınımı biner.
 * Tüm tekrar sayıları tam sayıdır, döngü kesintisiz kalır.
 */
function addLife(rot: Pose['rot'], pos: [number, number, number], u: number): void {
  const w = (cyc: number, ph = 0) => Math.sin(TAU * (cyc * u + ph));
  rot.spine[0] += 0.02 * w(3);
  rot.head[2] += 0.05 * w(2, 0.2);
  rot.head[1] += 0.06 * w(1, 0.4);
  rot.hips[2] += 0.025 * w(1);
  rot.shL[2] += 0.03 * w(2, 0.1);
  rot.shR[2] -= 0.03 * w(2, 0.6);
  rot.elL[0] += 0.04 * w(3, 0.3);
  rot.elR[0] += 0.04 * w(3, 0.8);
  pos[1] += 0.008 * w(3, 0.25);
}

/** Yüz ifadesi: göz ve ağız hareketi. Kelime bilgisi taşımaz, yalnızca klibin ruh hâlini söyler. */
export type Face = 'neutral' | 'smile' | 'laugh' | 'cry' | 'scared' | 'sleep' | 'tired' | 'sneeze' | 'effort' | 'focus' | 'eat' | 'talk';

/** Sıra `KUKLA_CLIPS` ile aynıdır. */
export const KUKLA_FACES: readonly Face[] = [
  'effort', 'laugh', 'effort', 'smile', 'sleep', 'eat', 'neutral', 'cry', 'laugh', 'sneeze',
  'sneeze', 'tired', 'smile', 'laugh', 'smile', 'effort', 'effort', 'effort', 'effort', 'effort',
  'effort', 'laugh', 'focus', 'effort', 'smile', 'effort', 'neutral', 'neutral', 'neutral', 'focus',
  'focus', 'talk', 'scared', 'scared', 'tired', 'effort', 'effort', 'effort', 'focus', 'effort',
  'smile', 'laugh',
];

