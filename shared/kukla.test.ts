import { describe, expect, it } from 'vitest';
import { JOINTS, KUKLA_CLIPS, KUKLA_LEVELS, KUKLA_LOOP_SEC, samplePose } from './kukla';
import { KUKLA_CLIP_WORDS } from './kukla_words';
import { WORDS } from './words';

describe('kukla klipleri', () => {
  it('her klibin bir kelimesi var, kelimeler kukla havuzunda ve tekrarsız', () => {
    expect(KUKLA_CLIP_WORDS.length).toBe(KUKLA_CLIPS.length);
    expect(KUKLA_CLIP_WORDS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(KUKLA_CLIP_WORDS).size).toBe(KUKLA_CLIP_WORDS.length);
    for (const w of KUKLA_CLIP_WORDS) expect(WORDS.kukla).toContain(w);
  });

  it('tüm klipler 10 sn sonunda baştaki poza döner (kesintisiz loop)', () => {
    for (let c = 0; c < KUKLA_CLIPS.length; c++) {
      for (const level of KUKLA_LEVELS) {
        const a = samplePose(c, 1.3, level);
        const b = samplePose(c, 1.3 + KUKLA_LOOP_SEC, level);
        for (const j of JOINTS) for (let i = 0; i < 3; i++) expect(b.rot[j][i]!).toBeCloseTo(a.rot[j][i]!, 6);
        expect(b.pos[1]).toBeCloseTo(a.pos[1], 6);
      }
    }
  });

  it('değerler sonlu; zorluk 3-4 siluet, 4 döngünün sonunda durur', () => {
    for (let c = 0; c < KUKLA_CLIPS.length; c++) {
      const p = samplePose(c, 2, 1);
      for (const j of JOINTS) for (const v of p.rot[j]) expect(Number.isFinite(v)).toBe(true);
      expect(p.silhouette).toBe(false);
      expect(samplePose(c, 2, 3).silhouette).toBe(true);
      const late1 = samplePose(c, 8, 4);
      const late2 = samplePose(c, 9, 4);
      expect(late2.rot).toEqual(late1.rot); // son %40 durgun
    }
  });
});
