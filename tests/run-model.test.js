import { describe, expect, it } from 'vitest';
import { PHASES } from '../src/domain/content.js';
import { RunModel } from '../src/domain/run-model.js';

describe('RunModel', () => {
  it('creates a deterministic run with the planned starting resources', () => {
    const run = new RunModel(42);
    expect(run.phase).toBe(PHASES.PRELUDE);
    expect(run.energy).toBe(100);
    expect(run.cohesion).toBe(100);
    expect(run.companions).toBe(20);
    expect(run.getUpgradeChoices().map((upgrade) => upgrade.id)).toEqual(
      new RunModel(42).getUpgradeChoices().map((upgrade) => upgrade.id),
    );
  });

  it('applies safe route costs and the old-river discount', () => {
    const run = new RunModel(1);
    run.startRegion(0);
    run.applyUpgrade('old-river');
    expect(run.getRouteOption('safe').detail).toBe('绕行 · 体力 -4');
    const route = run.chooseRoute('safe');
    expect(route.energyCost).toBe(4);
    expect(run.energy).toBe(96);
    expect(run.riskMultiplier).toBe(0.7);
    expect(run.chooseRoute('risky')).toBeNull();
  });

  it('makes gathering trade energy for protection and cohesion recovery', () => {
    const open = new RunModel(3);
    const gathered = new RunModel(3);
    open.startRegion(1);
    gathered.startRegion(1);
    open.update(1, { riskPressure: 1, gathering: false });
    gathered.update(1, { riskPressure: 1, gathering: true });
    expect(gathered.cohesion).toBeGreaterThan(open.cohesion);
    expect(gathered.energy).toBeLessThan(open.energy);
  });

  it('creates a rescue window before a companion stops', () => {
    const run = new RunModel(7);
    run.startRegion(2);
    run.cohesion = 0;
    run.update(0.1, {});
    expect(run.straggler).not.toBeNull();
    run.update(1.3, { gathering: true });
    expect(run.straggler).toBeNull();
    expect(run.companions).toBe(20);
    expect(run.cohesion).toBe(45);
    expect(run.energy).toBeLessThan(92);
  });

  it('extends the first rescue window and waives its cost with wait-together', () => {
    const run = new RunModel(8);
    run.startRegion(0);
    run.applyUpgrade('wait-together');
    run.energy = 6;
    run.cohesion = 0;
    run.update(0.1, {});
    expect(run.straggler.remaining).toBeGreaterThan(4.8);
    run.update(1.3, { gathering: true });
    expect(run.straggler).toBeNull();
    expect(run.energy).toBeGreaterThan(5);
  });

  it('uses wait-together only for the first straggler window in a region', () => {
    const run = new RunModel(18);
    run.startRegion(0);
    run.applyUpgrade('wait-together');
    run.cohesion = 0;
    run.update(0.1, {});
    expect(run.straggler.duration).toBe(5);
    run.update(5, {});
    run.cohesion = 0;
    run.update(0.1, {});
    expect(run.straggler.duration).toBe(2.5);
    expect(run.straggler.freeRescue).toBe(false);
  });

  it('soft-fails when fewer than six companions remain', () => {
    const run = new RunModel(9);
    run.startRegion(2);
    run.companions = 6;
    run.cohesion = 0;
    run.update(0.1, {});
    run.update(6, {});
    expect(run.companions).toBe(5);
    expect(run.phase).toBe(PHASES.JOURNAL);
    expect(run.failed).toBe(true);
  });

  it('never offers an upgrade that was already selected', () => {
    const run = new RunModel(11);
    const first = run.getUpgradeChoices()[0];
    run.applyUpgrade(first.id);
    expect(run.getUpgradeChoices().some((upgrade) => upgrade.id === first.id)).toBe(false);
  });

  it('applies the long-wing cap and immediate recovery', () => {
    const run = new RunModel(13);
    run.energy = 62;
    run.applyUpgrade('long-wing');
    expect(run.maxEnergy).toBe(120);
    expect(run.energy).toBe(82);
  });

  it('rewards a low-loss risk window with follow-season', () => {
    const run = new RunModel(14);
    run.startRegion(0);
    run.applyUpgrade('follow-season');
    run.energy = 70;
    run.cohesion = 90;
    run.update(0.2, { riskPressure: 0.2 });
    run.update(0.2, { riskPressure: 0 });
    expect(run.energy).toBeGreaterThan(74);
    expect(run.cohesion).toBeGreaterThan(99);
    expect(run.eventLog.some((event) => event.type === 'followSeasonTriggered')).toBe(true);
  });
});
