import { describe, expect, it } from 'vitest';
import { getTimedRouteChoice } from '../src/game/game-controller.js';

describe('timed route choice', () => {
  it('defaults to the safe route when the flock remains near the center', () => {
    expect(getTimedRouteChoice(0.5, true)).toBe('safe');
    expect(getTimedRouteChoice(0.5, false)).toBe('safe');
    expect(getTimedRouteChoice(0.41, true)).toBe('safe');
    expect(getTimedRouteChoice(0.59, false)).toBe('safe');
  });

  it('resolves the lane selected beyond the center dead zone', () => {
    expect(getTimedRouteChoice(0.25, true)).toBe('safe');
    expect(getTimedRouteChoice(0.25, false)).toBe('risky');
    expect(getTimedRouteChoice(0.75, false)).toBe('safe');
    expect(getTimedRouteChoice(0.75, true)).toBe('risky');
  });
});
