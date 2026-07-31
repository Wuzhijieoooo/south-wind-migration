export const PHASES = Object.freeze({
  PRELUDE: 'PRELUDE',
  FLIGHT: 'FLIGHT',
  ROUTE_CHOICE: 'ROUTE_CHOICE',
  STOPOVER: 'STOPOVER',
  ARRIVAL: 'ARRIVAL',
  JOURNAL: 'JOURNAL',
});

export const RUN_CONFIG = Object.freeze({
  startingEnergy: 100,
  startingCohesion: 100,
  startingCompanions: 20,
  softFailCompanions: 6,
  baselineEnergyDrain: 0.1,
  gatherEnergyDrain: 0.55,
  gatherRiskMultiplier: 0.35,
  gatherTurnMultiplier: 0.8,
  normalCohesionRecovery: 2,
  gatherCohesionRecovery: 7,
  baseRiskDamage: 12,
  rescueHold: 1.2,
  rescueCost: 8,
  stragglerDuration: 2.5,
});

export const PRELUDE = Object.freeze({
  id: 'prelude',
  name: '南风初起',
  subtitle: '河口以南 · 春分',
  duration: 40,
  theme: 'warm',
});

export const REGIONS = Object.freeze([
  {
    id: 'mist',
    name: '河口晨雾',
    subtitle: '潮水记得旧河道',
    duration: 110,
    routeAt: 58,
    theme: 'mist',
    hazard: 'fog',
    riskWindows: [[13, 25], [34, 48], [66, 81], [91, 106]],
    safeRoute: { id: 'reed-bay', name: '芦湾', detail: '绕行 · 体力 -8', energyCost: 8, riskMultiplier: 0.7, timeCost: 8 },
    riskyRoute: { id: 'open-water', name: '开水', detail: '直越 · 雾压增强', energyCost: 0, riskMultiplier: 1.15, timeCost: 0 },
  },
  {
    id: 'night',
    name: '城郊夜航',
    subtitle: '灯火不是星辰',
    duration: 125,
    routeAt: 67,
    theme: 'night',
    hazard: 'lights',
    riskWindows: [[12, 25], [36, 52], [75, 91], [102, 120]],
    safeRoute: { id: 'dark-valley', name: '暗谷', detail: '绕行 · 体力 -12', energyCost: 12, riskMultiplier: 0.7, timeCost: 12 },
    riskyRoute: { id: 'light-fields', name: '灯田', detail: '直越 · 牵引增强', energyCost: 0, riskMultiplier: 1.3, timeCost: 0 },
  },
  {
    id: 'snow',
    name: '雪岭横风',
    subtitle: '山口仍在等待春天',
    duration: 140,
    routeAt: 76,
    theme: 'snow',
    hazard: 'gust',
    riskWindows: [[10, 23], [32, 49], [59, 75], [92, 111], [121, 137]],
    safeRoute: { id: 'low-pass', name: '低谷', detail: '绕行 · 体力 -16', energyCost: 16, riskMultiplier: 0.75, timeCost: 16 },
    riskyRoute: { id: 'high-pass', name: '垭口', detail: '直越 · 横风增强', energyCost: 0, riskMultiplier: 1.45, timeCost: 0 },
  },
]);

export const UPGRADES = Object.freeze([
  {
    id: 'long-wing',
    name: '长翼',
    kind: '续航',
    description: '体力上限提高至 120，并立即恢复 20。',
    feedback: '翼尖被晨光拉长。',
  },
  {
    id: 'listen-wind',
    name: '听风',
    kind: '感知',
    description: '顺风带与风险提前 2 秒显现，顺风恢复增强。',
    feedback: '风线先于云层亮起。',
  },
  {
    id: 'old-river',
    name: '旧河',
    kind: '续航',
    description: '稳路的额外体力代价减半。',
    feedback: '旧航线重新浮出地面。',
  },
  {
    id: 'fold-wing',
    name: '合翼',
    kind: '守群',
    description: '收拢耗体降低 40%，风险影响降至 25%。',
    feedback: '队形收紧成一束安静的影子。',
  },
  {
    id: 'wait-together',
    name: '相候',
    kind: '守群',
    description: '每区首次掉队窗口延长至 5 秒，救回不耗体力。',
    feedback: '同伴的呼唤连成一条细线。',
  },
  {
    id: 'follow-season',
    name: '顺季',
    kind: '感知',
    description: '低损穿过风险后恢复 5 体力与 12 凝聚。',
    feedback: '一阵短促南风掠过全群。',
  },
]);

export function getRegion(index) {
  return REGIONS[index] ?? null;
}

export function getUpgrade(id) {
  return UPGRADES.find((upgrade) => upgrade.id === id) ?? null;
}
