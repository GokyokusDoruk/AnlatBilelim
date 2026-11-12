import { describe, expect, it } from 'vitest';
import { BOARD_SIZE } from '../../../shared/constants';
import { buildSpiral, starPoints, VIEW } from './spiral';

describe('spiral tahta', () => {
  const { points } = buildSpiral();

  it('başlangıç + 45 basamak noktası üretir, hepsi görünüm içinde', () => {
    expect(points.length).toBe(BOARD_SIZE + 1);
    for (const p of points) {
      expect(p.x).toBeGreaterThan(8);
      expect(p.x).toBeLessThan(VIEW - 8);
      expect(p.y).toBeGreaterThan(8);
      expect(p.y).toBeLessThan(VIEW - 8);
    }
  });

  it('son basamak merkezde, başlangıç dış kenarda', () => {
    const c = VIEW / 2;
    const dist = (p: { x: number; y: number }) => Math.hypot(p.x - c, p.y - c);
    expect(dist(points[BOARD_SIZE]!)).toBeLessThan(1);
    expect(dist(points[0]!)).toBeGreaterThan(140);
  });

  it('basamaklar üst üste binmez (komşu mesafe yeterli, tüm çiftler ayrık)', () => {
    for (let i = 1; i < points.length; i++) {
      expect(Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y)).toBeGreaterThan(25);
    }
    for (let i = 1; i < points.length; i++)
      for (let j = i + 1; j < points.length; j++)
        expect(Math.hypot(points[i]!.x - points[j]!.x, points[i]!.y - points[j]!.y)).toBeGreaterThan(25);
  });

  it('yıldız 10 köşe üretir', () => {
    expect(starPoints(0, 0, 10, 4).split(' ').length).toBe(10);
  });
});
