import { describe, expect, it } from 'vitest';
import { REGIONS } from '../src/domain/content.js';
import { getFlightEffects } from '../src/game/risk-director.js';

describe('risk director', () => {
  it('previews hazards before they become damaging', () => {
    const effects = getFlightEffects({ region: REGIONS[0], time: 11.5, center: { x: 0.4, y: 0.5 }, previewLead: 2 });
    expect(effects.riskInfo.preview).toBe(true);
    expect(effects.riskPressure).toBe(0);
  });

  it('makes fog pressure depend on leaving the remembered corridor', () => {
    const safeY = 0.5 + Math.sin(14 * 0.19) * 0.16;
    const centered = getFlightEffects({ region: REGIONS[0], time: 14, center: { x: 0.4, y: safeY } });
    const lost = getFlightEffects({ region: REGIONS[0], time: 14, center: { x: 0.4, y: 0.9 } });
    expect(lost.riskPressure).toBeGreaterThan(centered.riskPressure);
  });

  it('suppresses hazards while the route gate is active', () => {
    const effects = getFlightEffects({ region: REGIONS[1], time: 14, center: { x: 0.4, y: 0.5 }, routeActive: true });
    expect(effects.riskPressure).toBe(0);
    expect(effects.riskInfo).toBeNull();
  });
});
