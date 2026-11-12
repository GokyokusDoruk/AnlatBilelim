import { describe, expect, it } from 'vitest';
import { BOARD_SIZE } from '../../shared/constants';
import { CardDeck } from '../../shared/words';
import type { TripleCard } from '../../shared/types';
import * as e from './engine';
import { createRoomData, joinPlayer, type RoomData } from './RoomData';

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Deterministik rastgelelik (mulberry32). */
function rng(seed = 1) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCtx(now = 1_000_000, seed = 1): e.EngineCtx {
  const rand = rng(seed);
  return { now, deck: new CardDeck(rand), rand };
}

/** A: p1,p2 (p1 kurucu) / B: p3,p4. */
function lobby(): RoomData {
  const room = createRoomData('ABCDE', 0);
  for (let i = 1; i <= 4; i++) joinPlayer(room, uid(i), `P${i}`, i);
  for (let i = 1; i <= 4; i++) e.setTeam(room, uid(i), i <= 2 ? 'A' : 'B');
  return room;
}

function started(ctx = makeCtx()): RoomData {
  const room = lobby();
  for (let i = 1; i <= 4; i++) e.setReady(room, uid(i), true, ctx);
  return room;
}

/** Tur öncesi aşamasında verilen basamağa kadar tahtayı ilerlet ve turu başlat. */
function playRoundAt(room: RoomData, ctx: e.EngineCtx) {
  const r = room.round!;
  if (room.phase === 'roulette') e.onDeadline(room, { ...ctx, now: room.phaseDeadline! });
  const res = e.startRound(room, room.round!.observerId, ctx);
  expect(res.ok).toBe(true);
  return r;
}

describe('lobi', () => {
  it('herkes hazır olmadan başlamaz', () => {
    const ctx = makeCtx();
    const room = lobby();
    e.setReady(room, uid(1), true, ctx);
    e.setReady(room, uid(2), true, ctx);
    e.setReady(room, uid(3), true, ctx);
    expect(room.phase).toBe('lobby');
    e.setReady(room, uid(4), true, ctx);
    expect(room.phase).toBe('pre_round');
  });

  it('takımda 2 oyuncudan azsa başlamaz', () => {
    const ctx = makeCtx();
    const room = lobby();
    e.setTeam(room, uid(2), 'B'); // A: p1, B: p2,p3,p4
    for (let i = 1; i <= 4; i++) e.setReady(room, uid(i), true, ctx);
    expect(room.phase).toBe('lobby');
  });

  it('takım seçmeden hazır olunamaz, takım değişince hazır sıfırlanır', () => {
    const ctx = makeCtx();
    const room = createRoomData('ABCDE', 0);
    joinPlayer(room, uid(1), 'P1', 1);
    expect(e.setReady(room, uid(1), true, ctx).ok).toBe(false);
    e.setTeam(room, uid(1), 'A');
    e.setReady(room, uid(1), true, ctx);
    expect(room.players[0]!.ready).toBe(true);
    e.setTeam(room, uid(1), 'B');
    expect(room.players[0]!.ready).toBe(false);
  });

  it('oyun sırasında takım değiştirilemez', () => {
    const room = started();
    expect(e.setTeam(room, uid(1), 'B').ok).toBe(false);
  });
});

describe('rol rotasyonu', () => {
  it('anlatıcı takım içinde döner, gözlemci rakip takımdan gelir', () => {
    const ctx = makeCtx();
    const room = started(ctx);
    const narrators: string[] = [];
    const observers: string[] = [];
    for (let turn = 0; turn < 4; turn++) {
      const r = room.round!;
      expect(room.players.find((p) => p.id === r.narratorId)!.team).toBe(r.team);
      expect(room.players.find((p) => p.id === r.observerId)!.team).not.toBe(r.team);
      narrators.push(r.narratorId);
      observers.push(r.observerId);
      playRoundAt(room, ctx);
      e.endRound(room, ctx, false);
      e.continueFromSummary(room, uid(1), ctx);
    }
    // A takımı sırayla p1, p2; B takımı p3, p4 anlatıcı olur.
    expect(narrators).toEqual([uid(1), uid(3), uid(2), uid(4)]);
    expect(observers).toEqual([uid(3), uid(1), uid(4), uid(2)]);
  });

  it('bağlantısı kopan oyuncu atlanır', () => {
    const ctx = makeCtx();
    const room = started(ctx);
    room.players.find((p) => p.id === uid(2))!.connected = false;
    e.onRosterChanged(room, ctx);
    for (let turn = 0; turn < 4; turn++) {
      expect(room.round!.narratorId).not.toBe(uid(2));
      expect(room.round!.observerId).not.toBe(uid(2));
      playRoundAt(room, ctx);
      e.endRound(room, ctx, false);
      e.continueFromSummary(room, uid(1), ctx);
    }
  });

  it('bir takımın tamamı kopunca lobiye dönülür', () => {
    const ctx = makeCtx();
    const room = started(ctx);
    for (const id of [uid(3), uid(4)]) room.players.find((p) => p.id === id)!.connected = false;
    e.onRosterChanged(room, ctx);
    expect(room.phase).toBe('lobby');
  });
});

describe('anlatma modu', () => {
  it('doğru +1, yasaklı -1, pass hakkı 3', () => {
    const ctx = makeCtx();
    const room = started(ctx);
    const r = playRoundAt(room, ctx);
    expect(room.round!.mode).toBe('anlatma');
    expect(room.round!.endsAt).toBe(ctx.now + 60_000);
    expect(room.roundCard?.kind).toBe('tabu');

    expect(e.markCorrect(room, r.observerId, undefined, ctx).ok).toBe(true);
    expect(e.markCorrect(room, r.observerId, undefined, ctx).ok).toBe(true);
    expect(e.markForbidden(room, r.observerId, ctx).ok).toBe(true);
    expect(room.round!.correct).toBe(2);
    expect(room.round!.forbiddenHits).toBe(1);

    for (let i = 0; i < 3; i++) expect(e.pass(room, r.narratorId, ctx).ok).toBe(true);
    expect(e.pass(room, r.narratorId, ctx).ok).toBe(false); // 4. pass reddedilir
    expect(room.round!.passesUsed).toBe(3);
  });

  it('yetkisiz roller işlem yapamaz', () => {
    const ctx = makeCtx();
    const room = started(ctx);
    const r = playRoundAt(room, ctx);
    expect(e.markCorrect(room, r.narratorId, undefined, ctx).ok).toBe(false);
    expect(e.markForbidden(room, r.narratorId, ctx).ok).toBe(false);
    expect(e.pass(room, r.observerId, ctx).ok).toBe(false);
    expect(e.startRound(room, r.narratorId, ctx).ok).toBe(false);
  });

  it('süre dolunca skor adıma çevrilir, negatif skor geri götürmez', () => {
    const ctx = makeCtx();
    const room = started(ctx);
    const r = playRoundAt(room, ctx);
    for (let i = 0; i < 5; i++) e.markCorrect(room, r.observerId, undefined, ctx);
    e.markForbidden(room, r.observerId, ctx);
    e.onDeadline(room, { ...ctx, now: room.round!.endsAt! });
    expect(room.phase).toBe('round_summary');
    expect(room.lastSummary).toMatchObject({ correct: 5, forbiddenHits: 1, stepsAdvanced: 4, newPosition: 4 });
    expect(room.board.positions.A).toBe(4);

    // B takımı net negatif oynar
    e.continueFromSummary(room, uid(1), ctx);
    const r2 = playRoundAt(room, ctx);
    e.markForbidden(room, r2.observerId, ctx);
    e.onDeadline(room, { ...ctx, now: room.round!.endsAt! });
    expect(room.lastSummary!.stepsAdvanced).toBe(0);
    expect(room.board.positions.B).toBe(0);
  });

  it('süre bittikten sonra gelen eylem reddedilir ve turu kapatır', () => {
    const ctx = makeCtx();
    const room = started(ctx);
    const r = playRoundAt(room, ctx);
    const late = { ...ctx, now: room.round!.endsAt! + 1 };
    expect(e.markCorrect(room, r.observerId, undefined, late).ok).toBe(false);
    expect(room.phase).toBe('round_summary');
  });
});

/** Tahtayı belirli konuma getirip o basamağın modunda tur başlatır. */
function roomAtPosition(pos: number, ctx: e.EngineCtx): RoomData {
  const room = started(ctx);
  room.board.positions.A = pos;
  room.round = null;
  room.turnTeam = 'A';
  e.beginTurn(room, ctx);
  return room;
}

describe('üçlü kart modları (çizme, kukla, 15 kelime)', () => {
  const cases = [
    { pos: 10, mode: 'cizme', sec: 90 },
    { pos: 15, mode: 'kukla', sec: 120 },
    { pos: 25, mode: 'onbes', sec: 120 },
  ] as const;

  for (const c of cases) {
    it(`${c.mode}: tahta ${c.pos + 1}. basamak, ${c.sec} sn`, () => {
      const ctx = makeCtx();
      const room = roomAtPosition(c.pos, ctx);
      expect(room.phase).toBe('pre_round');
      expect(room.round!.mode).toBe(c.mode);
      e.startRound(room, room.round!.observerId, ctx);
      expect(room.round!.endsAt).toBe(ctx.now + c.sec * 1000);
      expect(room.roundCard?.kind).toBe(c.mode === 'kukla' ? 'kukla' : 'triple');
    });
  }

  it('3 kelime de bilinince otomatik yeni kart gelir', () => {
    const ctx = makeCtx();
    const room = roomAtPosition(10, ctx);
    const r = room.round!;
    e.startRound(room, r.observerId, ctx);
    const first = room.roundCard as TripleCard;
    e.markCorrect(room, r.observerId, 0, ctx);
    e.markCorrect(room, r.observerId, 0, ctx); // çift tik sayılmaz
    e.markCorrect(room, r.observerId, 1, ctx);
    expect(room.round!.correct).toBe(2);
    expect((room.roundCard as TripleCard).words).toEqual(first.words);
    e.markCorrect(room, r.observerId, 2, ctx);
    expect(room.round!.correct).toBe(3);
    const next = room.roundCard as TripleCard;
    expect(next.solved).toEqual([false, false, false]);
    expect(next.words).not.toEqual(first.words);
  });

  it('pass: bilinmemiş kelime sayısı kadar hak düşer, bilinen skorda kalır', () => {
    const ctx = makeCtx();
    const room = roomAtPosition(10, ctx);
    const r = room.round!;
    e.startRound(room, r.observerId, ctx);
    e.markCorrect(room, r.observerId, 1, ctx); // 1 bilindi, 2 kaldı
    expect(e.pass(room, r.narratorId, ctx).ok).toBe(true);
    expect(room.round!.passesUsed).toBe(2);
    expect(room.round!.correct).toBe(1);
    expect((room.roundCard as TripleCard).solved).toEqual([false, false, false]);
  });

  it('kalan hak bilinmemiş kelimeden azsa pass reddedilir', () => {
    const ctx = makeCtx();
    const room = roomAtPosition(10, ctx);
    const r = room.round!;
    e.startRound(room, r.observerId, ctx);
    e.markCorrect(room, r.observerId, 1, ctx);
    e.pass(room, r.narratorId, ctx); // 2 hak gitti, 1 kaldı
    // Yeni kartta 3 bilinmemiş var, 1 hak yetmez
    expect(e.pass(room, r.narratorId, ctx).ok).toBe(false);
    // 2 kelime bilinirse 1 bilinmemiş kalır, 1 hak yeter
    e.markCorrect(room, r.observerId, 0, ctx);
    e.markCorrect(room, r.observerId, 2, ctx);
    expect(e.pass(room, r.narratorId, ctx).ok).toBe(true);
    expect(room.round!.passesUsed).toBe(3);
  });

  it('15 kelime: sayaç 0 olunca süre bitmeden tur biter', () => {
    const ctx = makeCtx();
    const room = roomAtPosition(25, ctx);
    const r = room.round!;
    e.startRound(room, r.observerId, ctx);
    expect(room.round!.cluesLeft).toBe(15);
    e.markCorrect(room, r.observerId, 0, ctx);
    for (let i = 0; i < 14; i++) e.useClue(room, r.observerId, ctx);
    expect(room.phase).toBe('round');
    expect(room.round!.cluesLeft).toBe(1);
    e.useClue(room, r.observerId, ctx);
    expect(room.phase).toBe('round_summary');
    expect(room.lastSummary).toMatchObject({ endedByClueLimit: true, correct: 1, stepsAdvanced: 1 });
  });

  it('ipucu sayacı diğer modlarda çalışmaz', () => {
    const ctx = makeCtx();
    const room = started(ctx);
    const r = playRoundAt(room, ctx);
    expect(e.useClue(room, r.observerId, ctx).ok).toBe(false);
  });
});

describe('karışık mod, kazanma ve tur geçişi', () => {
  it('31. basamak ve sonrası çark ile mod seçer', () => {
    const ctx = makeCtx();
    const room = roomAtPosition(30, ctx);
    expect(room.phase).toBe('roulette');
    expect(room.roulette).toMatchObject({ startedAt: ctx.now, result: room.round!.mode });
    expect(room.phaseDeadline).toBe(ctx.now + 5000);
    expect(e.startRound(room, room.round!.observerId, ctx).ok).toBe(false); // çark bitmeden başlamaz
    e.onDeadline(room, { ...ctx, now: room.phaseDeadline! });
    expect(room.phase).toBe('pre_round');
  });

  it('çark rastgele tüm modları üretir', () => {
    const modes = new Set<string>();
    for (let seed = 1; seed < 60; seed++) modes.add(roomAtPosition(30, makeCtx(1000, seed)).round!.mode);
    expect(modes.size).toBe(4);
  });

  it('45. basamağa ulaşan takım kazanır, tur sınırı aşılsa da', () => {
    const ctx = makeCtx();
    const room = roomAtPosition(BOARD_SIZE - 2, ctx);
    if (room.phase === 'roulette') e.onDeadline(room, { ...ctx, now: room.phaseDeadline! });
    const r = room.round!;
    e.startRound(room, r.observerId, ctx);
    if (room.round!.mode === 'anlatma') for (let i = 0; i < 6; i++) e.markCorrect(room, r.observerId, undefined, ctx);
    else for (let i = 0; i < 3; i++) e.markCorrect(room, r.observerId, i, ctx);
    e.onDeadline(room, { ...ctx, now: room.round!.endsAt! });
    expect(room.phase).toBe('game_over');
    expect(room.winner).toBe('A');
    expect(room.board.positions.A).toBe(BOARD_SIZE);
  });

  it('özet sonrası sıra diğer takıma geçer; otomatik de geçer', () => {
    const ctx = makeCtx();
    const room = started(ctx);
    playRoundAt(room, ctx);
    e.endRound(room, ctx, false);
    expect(room.phaseDeadline).toBe(ctx.now + 12_000);
    expect(e.continueFromSummary(room, uid(3), ctx).ok).toBe(false); // kurucu değil
    e.onDeadline(room, { ...ctx, now: room.phaseDeadline! });
    expect(room.phase).toBe('pre_round');
    expect(room.turnTeam).toBe('B');
  });

  it('oyun bitince kurucu lobiye döndürür', () => {
    const ctx = makeCtx();
    const room = roomAtPosition(BOARD_SIZE - 1, ctx);
    if (room.phase === 'roulette') e.onDeadline(room, { ...ctx, now: room.phaseDeadline! });
    e.startRound(room, room.round!.observerId, ctx);
    if (room.round!.mode === 'anlatma') e.markCorrect(room, room.round!.observerId, undefined, ctx);
    else e.markCorrect(room, room.round!.observerId, 0, ctx);
    e.onDeadline(room, { ...ctx, now: room.round!.endsAt! });
    expect(room.phase).toBe('game_over');
    e.continueFromSummary(room, uid(1), ctx);
    expect(room.phase).toBe('lobby');
    expect(room.board.positions).toEqual({ A: 0, B: 0 });
    expect(room.players.every((p) => !p.ready)).toBe(true);
  });
});

describe('kukla sırayı tüketmez', () => {
  it('kukla turu anlatıcı/gözlemci imleçlerini ilerletmez', () => {
    const ctx = makeCtx();
    const room = roomAtPosition(15, ctx);
    expect(room.round!.mode).toBe('kukla');
    expect(room.narratorCursor).toEqual({ A: 1, B: 0 }); // yalnızca oyun başındaki tur sayıldı
    expect(room.observerCursor).toEqual({ A: 0, B: 1 });
  });

  it('kukladan sonra A takımının sonraki turu aynı oyuncuyla devam eder', () => {
    const ctx = makeCtx();
    const room = started(ctx);
    const before = room.round!.narratorId; // anlatma turu
    e.endRound(room, ctx, false);
    room.board.positions.A = 15;
    room.turnTeam = 'A';
    e.beginTurn(room, ctx); // kukla
    const kuklaNarrator = room.round!.narratorId;
    room.board.positions.A = 20;
    room.turnTeam = 'A';
    e.beginTurn(room, ctx); // sonraki mod
    expect(room.round!.mode).not.toBe('kukla');
    expect(room.round!.narratorId).toBe(kuklaNarrator);
    expect(before).not.toBe(kuklaNarrator);
  });
});

describe('kukla turu (animasyon)', () => {
  function kuklaRound() {
    const ctx = makeCtx();
    const room = roomAtPosition(15, ctx);
    const r = room.round!;
    e.startRound(room, r.observerId, ctx);
    return { ctx, room, r };
  }

  it('tek kelime + herkese kelimesiz animasyon bilgisi', () => {
    const { ctx, room } = kuklaRound();
    const card = room.roundCard as any;
    expect(card.kind).toBe('kukla');
    expect(room.round!.anim).toEqual({ clip: card.clip, level: card.level, startedAt: ctx.now });
    expect(JSON.stringify(room.round)).not.toContain(card.word);
  });

  it('bildi: +1 ve yeni animasyon; pass: 1 hak, en fazla 3', () => {
    const { ctx, room, r } = kuklaRound();
    const first = (room.roundCard as any).clip;
    e.markCorrect(room, r.observerId, undefined, { ...ctx, now: ctx.now + 5000 });
    expect(room.round!.correct).toBe(1);
    expect(room.round!.anim!.startedAt).toBe(ctx.now + 5000);
    expect((room.roundCard as any).clip).not.toBe(first);
    for (let i = 0; i < 3; i++) expect(e.pass(room, r.narratorId, ctx).ok).toBe(true);
    expect(room.round!.passesUsed).toBe(3);
    expect(e.pass(room, r.narratorId, ctx).ok).toBe(false);
  });

  it('yetkisiz roller işlem yapamaz', () => {
    const { ctx, room, r } = kuklaRound();
    expect(e.markCorrect(room, r.narratorId, undefined, ctx).ok).toBe(false);
    expect(e.pass(room, r.observerId, ctx).ok).toBe(false);
  });
});
