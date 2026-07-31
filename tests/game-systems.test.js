import { describe, expect, it } from 'vitest';
import { Flock } from '../src/game/flock.js';
import { WindField } from '../src/game/wind-field.js';

describe('WindField', () => {
  it('keeps a released wind path alive briefly and then expires it', () => {
    const field = new WindField({ ttl: 1.5 });
    field.begin(1, { x: 0.3, y: 0.4 }, 10);
    field.move(1, { x: 0.5, y: 0.5 }, 10.2);
    field.end(1);
    field.update(10.8, 0.6);
    expect(field.points.length).toBe(2);
    field.update(12, 1.2);
    expect(field.points).toHaveLength(0);
  });

  it('reports sharper input for a fast reversal than a smooth path', () => {
    const smooth = new WindField();
    smooth.begin(1, { x: 0.2, y: 0.5 }, 1);
    smooth.move(1, { x: 0.35, y: 0.5 }, 1.1);
    smooth.move(1, { x: 0.5, y: 0.52 }, 1.2);

    const reversal = new WindField();
    reversal.begin(1, { x: 0.2, y: 0.5 }, 1);
    reversal.move(1, { x: 0.55, y: 0.5 }, 1.1);
    reversal.move(1, { x: 0.25, y: 0.5 }, 1.2);
    expect(reversal.sharpness).toBeGreaterThan(smooth.sharpness);
  });
});

describe('Flock', () => {
  it('keeps the same counted birds across devices', () => {
    expect(new Flock({ count: 20, seed: 5 }).birds).toHaveLength(20);
  });

  it('tightens its formation while gathering', () => {
    const flock = new Flock({ count: 20, seed: 5 });
    const wind = { active: false, target: { x: 0.43, y: 0.52 }, strength: 0, sharpness: 0 };
    for (let index = 0; index < 180; index += 1) flock.update(1 / 60, { wind, gathering: false, companionCount: 20 });
    const open = flock.getDispersion();
    for (let index = 0; index < 180; index += 1) flock.update(1 / 60, { wind, gathering: true, companionCount: 20 });
    expect(flock.getDispersion()).toBeLessThan(open);
  });

  it('marks a trailing bird as the visible straggler', () => {
    const flock = new Flock({ count: 20, seed: 5 });
    flock.update(1 / 60, { companionCount: 20, straggler: { remaining: 2 } });
    expect(flock.stragglerIndex).not.toBeNull();
    flock.update(1 / 60, { companionCount: 20, straggler: null });
    expect(flock.stragglerIndex).toBeNull();
  });
});
