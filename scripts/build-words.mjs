// Kaynak metin dosyalarından shared/data/words_tr.json üretir ve doğrular.
// Kullanım: npm run words:build   (sadece doğrulama için: npm run words:check)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = (f) => fileURLToPath(new URL(f, import.meta.url));
const MIN_PER_LEVEL = 150;
const LEVELS = [1, 2, 3, 4];
const checkOnly = process.argv.includes('--check');
const errors = [];

const norm = (s) => s.toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N} ]/gu, '').trim();

function readLines(file) {
  return readFileSync(dir(file), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}
function readList(file) {
  return readLines(file).flatMap((l) => l.split(',')).map((s) => s.trim()).filter(Boolean);
}

/** Her mod için 4 seviye: en az 150 kelime, mod içinde seviyeler arası dahil tekrar yok. */
function checkLevels(mode, lists, key = (x) => x) {
  const seen = new Map();
  lists.forEach((list, i) => {
    const name = `${mode} seviye ${i + 1}`;
    if (list.length < MIN_PER_LEVEL) errors.push(`${name}: ${list.length} kelime var, en az ${MIN_PER_LEVEL} olmalı`);
    for (const item of list) {
      const w = key(item);
      const k = norm(w);
      if (w.length > 40) errors.push(`${name}: çok uzun "${w}"`);
      if (seen.has(k)) errors.push(`${name}: "${w}" zaten ${seen.get(k)} içinde`);
      else seen.set(k, name);
    }
  });
}

// Kukla klip adları -> index (shared/kukla_words.ts sırası = KUKLA_CLIPS sırası)
const clipNames = [...readFileSync(dir('../shared/kukla_words.ts'), 'utf8').matchAll(/^\s+'([^']+)',$/gm)].map((m) => m[1]);

const anlatma = LEVELS.map((lv) =>
  readLines(`words_src_anlatma_${lv}.txt`).map((line) => {
    const [word, rest = ''] = line.split('|');
    return { word: word.trim(), forbidden: rest.split(',').map((s) => s.trim()).filter(Boolean) };
  }),
);
checkLevels('anlatma', anlatma, (c) => c.word);
anlatma.forEach((list, i) => {
  for (const c of list) {
    if (c.forbidden.length !== 5) errors.push(`anlatma seviye ${i + 1}: "${c.word}" için ${c.forbidden.length} yasaklı kelime var, 5 olmalı`);
    if (new Set(c.forbidden.map(norm)).size !== c.forbidden.length) errors.push(`anlatma seviye ${i + 1}: "${c.word}" yasaklıları tekrar ediyor`);
    const parts = norm(c.word).split(' ');
    for (const f of c.forbidden) {
      const nf = norm(f);
      if (parts.includes(nf) || norm(c.word) === nf) errors.push(`anlatma seviye ${i + 1}: "${c.word}" kendi yasaklısı "${f}" ile aynı`);
    }
  }
});

const cizme = LEVELS.map((lv) => readList(`words_src_cizme_${lv}.txt`));
const onbes = LEVELS.map((lv) => readList(`words_src_onbes_${lv}.txt`));
checkLevels('cizme', cizme);
checkLevels('onbes', onbes);

const kukla = LEVELS.map((lv) =>
  readLines(`words_src_kukla_${lv}.txt`).map((line) => {
    const [word, clipName = ''] = line.split('|').map((s) => s.trim());
    const clip = clipNames.indexOf(clipName);
    if (clip < 0) errors.push(`kukla seviye ${lv}: "${word}" için bilinmeyen klip "${clipName}"`);
    return { word, clip };
  }),
);
checkLevels('kukla', kukla, (c) => c.word);
for (const name of clipNames) if (!kukla[0].some((c) => c.word === name)) errors.push(`kukla seviye 1: klip adı "${name}" kelime olarak da bulunmalı`);

if (errors.length) {
  console.error(errors.slice(0, 200).map((e) => '✗ ' + e).join('\n') + (errors.length > 200 ? `\n… +${errors.length - 200} hata` : ''));
  process.exit(1);
}

const out = { version: 2, anlatma, cizme, kukla, onbes };
const json = JSON.stringify(out) + '\n';
if (checkOnly) {
  const current = readFileSync(dir('../shared/data/words_tr.json'), 'utf8');
  if (current !== json) {
    console.error('✗ words_tr.json kaynak dosyalarla uyumsuz, `npm run words:build` çalıştır.');
    process.exit(1);
  }
} else {
  writeFileSync(dir('../shared/data/words_tr.json'), json);
}
console.log(`✓ ${['anlatma', 'cizme', 'kukla', 'onbes'].map((m) => `${m}: ${out[m].map((l) => l.length).join('/')}`).join(' · ')}`);
