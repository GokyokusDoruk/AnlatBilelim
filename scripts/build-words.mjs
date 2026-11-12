// Kaynak metin dosyalarından shared/data/words_tr.json üretir ve doğrular.
// Kullanım: npm run words:build   (sadece doğrulama için: npm run words:check)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = (f) => fileURLToPath(new URL(f, import.meta.url));
const MIN = 100;
const checkOnly = process.argv.includes('--check');
const errors = [];

const norm = (s) => s.toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N} ]/gu, '').trim();

function readList(file) {
  return readFileSync(dir(file), 'utf8')
    .split(/\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function checkSimple(name, list) {
  const seen = new Set();
  for (const w of list) {
    const k = norm(w);
    if (seen.has(k)) errors.push(`${name}: tekrar eden kelime "${w}"`);
    seen.add(k);
    if (w.length > 28) errors.push(`${name}: çok uzun "${w}"`);
  }
  if (list.length < MIN) errors.push(`${name}: ${list.length} kelime var, en az ${MIN} olmalı`);
}

// Anlatma: "Kelime|y1, y2, y3, y4, y5"
const anlatma = readFileSync(dir('words_src_anlatma.txt'), 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean)
  .map((line) => {
    const [word, rest = ''] = line.split('|');
    return { word: word.trim(), forbidden: rest.split(',').map((s) => s.trim()).filter(Boolean) };
  });

const seen = new Set();
for (const c of anlatma) {
  const k = norm(c.word);
  if (seen.has(k)) errors.push(`anlatma: tekrar eden kelime "${c.word}"`);
  seen.add(k);
  if (c.forbidden.length !== 5) errors.push(`anlatma: "${c.word}" için ${c.forbidden.length} yasaklı kelime var, 5 olmalı`);
  if (new Set(c.forbidden.map(norm)).size !== c.forbidden.length) errors.push(`anlatma: "${c.word}" yasaklı kelimeleri tekrar ediyor`);
  const titleParts = norm(c.word).split(' ');
  for (const f of c.forbidden) {
    const nf = norm(f);
    if (titleParts.includes(nf) || norm(c.word) === nf) errors.push(`anlatma: "${c.word}" kendi yasaklısı "${f}" ile aynı`);
  }
}
if (anlatma.length < MIN) errors.push(`anlatma: ${anlatma.length} kart var, en az ${MIN} olmalı`);

const cizme = readList('words_src_cizme.txt');
const kukla = readList('words_src_kukla.txt');
const onbes = readList('words_src_onbes.txt');
checkSimple('cizme', cizme);
checkSimple('kukla', kukla);
checkSimple('onbes', onbes);

if (errors.length) {
  console.error(errors.map((e) => '✗ ' + e).join('\n'));
  process.exit(1);
}

const out = { version: 1, anlatma, cizme, kukla, onbes };
const json = JSON.stringify(out, null, 1) + '\n';
if (checkOnly) {
  const current = readFileSync(dir('../shared/data/words_tr.json'), 'utf8');
  if (current !== json) {
    console.error('✗ words_tr.json kaynak dosyalarla uyumsuz, `npm run words:build` çalıştır.');
    process.exit(1);
  }
} else {
  writeFileSync(dir('../shared/data/words_tr.json'), json);
}
console.log(`✓ anlatma ${anlatma.length}, cizme ${cizme.length}, kukla ${kukla.length}, onbes ${onbes.length}`);
