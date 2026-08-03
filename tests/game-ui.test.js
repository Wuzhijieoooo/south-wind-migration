import { describe, expect, it } from 'vitest';
import { formatDuration, formatRouteNames } from '../src/ui/game-ui.js';

describe('journal formatting', () => {
  it('normalizes rounded seconds into the next minute', () => {
    expect(formatDuration(59.6)).toBe('1:00');
    expect(formatDuration(125.2)).toBe('2:05');
  });

  it('uses player-facing route names and keeps old records readable', () => {
    expect(formatRouteNames([{ routeId: 'reed-bay', routeName: '芦湾' }])).toBe('芦湾');
    expect(formatRouteNames([{ routeId: 'dark-valley' }])).toBe('dark-valley');
    expect(formatRouteNames([])).toBe('尚未经过岔路');
  });
});
