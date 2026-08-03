import { getRegion, getUpgrade, PHASES, RUN_CONFIG, UPGRADES } from './content.js';
import { createRandom, shuffled } from './random.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export class RunModel {
  constructor(seed = Date.now()) {
    this.seed = seed >>> 0;
    this.random = createRandom(this.seed);
    this.phase = PHASES.PRELUDE;
    this.regionIndex = -1;
    this.phaseTime = 0;
    this.runTime = 0;
    this.energy = RUN_CONFIG.startingEnergy;
    this.maxEnergy = RUN_CONFIG.startingEnergy;
    this.cohesion = RUN_CONFIG.startingCohesion;
    this.companions = RUN_CONFIG.startingCompanions;
    this.startedCompanions = RUN_CONFIG.startingCompanions;
    this.upgradeIds = [];
    this.routes = [];
    this.eventLog = [];
    this.route = null;
    this.routeResolved = false;
    this.regionDurationBonus = 0;
    this.riskMultiplier = 1;
    this.straggler = null;
    this.waitTogetherUsed = false;
    this.failed = false;
    this.lastRiskActive = false;
    this.riskStartCohesion = this.cohesion;
    this.record('runStarted', { seed: this.seed });
  }

  get region() {
    return getRegion(this.regionIndex);
  }

  get gatheringRiskMultiplier() {
    return this.hasUpgrade('fold-wing') ? 0.25 : RUN_CONFIG.gatherRiskMultiplier;
  }

  get gatheringDrain() {
    return RUN_CONFIG.gatherEnergyDrain * (this.hasUpgrade('fold-wing') ? 0.6 : 1);
  }

  hasUpgrade(id) {
    return this.upgradeIds.includes(id);
  }

  record(type, data = {}) {
    this.eventLog.push({ type, at: Number(this.runTime.toFixed(2)), ...data });
  }

  advanceClock(dt) {
    this.phaseTime += dt;
    this.runTime += dt;
  }

  startRegion(index) {
    this.regionIndex = index;
    this.phase = PHASES.FLIGHT;
    this.phaseTime = 0;
    this.route = null;
    this.routeResolved = false;
    this.regionDurationBonus = 0;
    this.riskMultiplier = 1;
    this.waitTogetherUsed = false;
    this.lastRiskActive = false;
    this.record('regionStarted', { regionId: this.region?.id });
  }

  startStopover() {
    this.phase = PHASES.STOPOVER;
    this.phaseTime = 0;
    this.record('stopoverStarted', { regionId: this.region?.id });
  }

  arrive() {
    this.phase = PHASES.ARRIVAL;
    this.phaseTime = 0;
    this.record('runCompleted', { arrivedCount: this.companions, runDuration: this.runTime });
  }

  finishJournal() {
    this.phase = PHASES.JOURNAL;
    this.phaseTime = 0;
  }

  getUpgradeChoices(count = 3) {
    const available = UPGRADES.filter((upgrade) => !this.hasUpgrade(upgrade.id));
    return shuffled(available, this.random).slice(0, count);
  }

  applyUpgrade(id) {
    const upgrade = getUpgrade(id);
    if (!upgrade || this.hasUpgrade(id)) return false;
    this.upgradeIds.push(id);
    if (id === 'long-wing') {
      this.maxEnergy = 120;
      this.energy = clamp(this.energy + 20, 0, this.maxEnergy);
    }
    this.record('upgradeChosen', { upgradeId: id });
    return true;
  }

  getRouteOption(kind = 'safe') {
    if (!this.region) return null;
    const safe = kind !== 'risky';
    const definition = safe ? this.region.safeRoute : this.region.riskyRoute;
    const costScale = safe && this.hasUpgrade('old-river') ? 0.5 : 1;
    const energyCost = definition.energyCost * costScale;
    return {
      kind: safe ? 'safe' : 'risky',
      ...definition,
      energyCost,
      detail: safe && energyCost !== definition.energyCost
        ? `绕行 · 体力 -${energyCost}`
        : definition.detail,
    };
  }

  chooseRoute(kind = 'safe') {
    if (!this.region || this.routeResolved) return null;
    const route = this.getRouteOption(kind);
    this.energy = clamp(this.energy - route.energyCost, 0, this.maxEnergy);
    this.riskMultiplier = route.riskMultiplier;
    this.regionDurationBonus = route.timeCost;
    this.routeResolved = true;
    this.route = route;
    this.routes.push({
      regionId: this.region.id,
      routeId: route.id,
      routeName: route.name,
      kind: route.kind,
    });
    this.record('routeChosen', {
      regionId: this.region.id,
      routeId: route.id,
      kind: route.kind,
      energyCost: route.energyCost,
    });
    return this.route;
  }

  update(dt, context = {}) {
    if (![PHASES.PRELUDE, PHASES.FLIGHT].includes(this.phase) || this.failed) return;
    this.advanceClock(dt);

    const energyAtStart = this.energy;
    const collapsedAtStart = this.cohesion <= 0;
    const gatheringRequested = Boolean(context.gathering);
    const gathering = gatheringRequested && this.energy > 0;
    const riskPressure = clamp(context.riskPressure ?? 0, 0, 1.5);
    const sharpness = clamp(context.sharpness ?? 0, 0, 1);
    const safeCurrent = Boolean(context.safeCurrent);
    const riskActive = riskPressure > 0.05;

    let energyDelta = -RUN_CONFIG.baselineEnergyDrain * dt;
    if (gathering) energyDelta -= this.gatheringDrain * dt;
    if (safeCurrent) energyDelta += (this.hasUpgrade('listen-wind') ? 3.1 : 2.2) * dt;
    energyDelta -= sharpness * 0.22 * dt;
    this.energy = clamp(this.energy + energyDelta, 0, this.maxEnergy);

    const protection = gathering ? this.gatheringRiskMultiplier : 1;
    const fatigueMultiplier = this.energy <= 0 ? 1.35 : 1;
    const loss = riskPressure * this.riskMultiplier * protection * RUN_CONFIG.baseRiskDamage * fatigueMultiplier * dt;
    const turnLoss = sharpness * 3.5 * dt;
    const recovery = gathering ? RUN_CONFIG.gatherCohesionRecovery : RUN_CONFIG.normalCohesionRecovery;
    this.cohesion = clamp(this.cohesion - loss - turnLoss + (riskActive ? 0 : recovery * dt), 0, 100);

    if (riskActive && !this.lastRiskActive) this.riskStartCohesion = this.cohesion;
    if (!riskActive && this.lastRiskActive) this.resolveRiskWindow();
    this.lastRiskActive = riskActive;

    if ((collapsedAtStart || this.cohesion <= 0) && !this.straggler) {
      this.cohesion = 0;
      this.startStraggler(Math.max(energyAtStart, this.energy));
    }
    if (this.straggler) this.updateStraggler(dt, gatheringRequested);
  }

  resolveRiskWindow() {
    const loss = Math.max(0, this.riskStartCohesion - this.cohesion);
    if (this.hasUpgrade('follow-season') && loss < 15) {
      this.energy = clamp(this.energy + 5, 0, this.maxEnergy);
      this.cohesion = clamp(this.cohesion + 12, 0, 100);
      this.record('followSeasonTriggered', { cohesionLoss: loss });
    }
    this.record('riskResolved', { regionId: this.region?.id, cohesionLoss: Number(loss.toFixed(2)) });
  }

  startStraggler(availableEnergy = this.energy) {
    const freeRescue = this.hasUpgrade('wait-together') && !this.waitTogetherUsed;
    const duration = freeRescue ? 5 : RUN_CONFIG.stragglerDuration;
    if (freeRescue) this.waitTogetherUsed = true;
    this.straggler = {
      remaining: duration,
      duration,
      gatherHold: 0,
      freeRescue,
      canRescue: freeRescue || availableEnergy >= RUN_CONFIG.rescueCost,
    };
    this.record('stragglerStarted', { regionId: this.region?.id, duration: this.straggler.remaining });
  }

  updateStraggler(dt, gathering) {
    this.straggler.remaining -= dt;
    this.straggler.gatherHold = gathering && this.straggler.canRescue
      ? this.straggler.gatherHold + dt
      : Math.max(0, this.straggler.gatherHold - dt * 1.5);
    if (this.straggler.gatherHold >= RUN_CONFIG.rescueHold) {
      this.rescueStraggler();
      return;
    }
    if (this.straggler.remaining <= 0) this.dropStraggler();
  }

  rescueStraggler() {
    if (!this.straggler) return false;
    if (!this.straggler.freeRescue) this.energy = clamp(this.energy - RUN_CONFIG.rescueCost, 0, this.maxEnergy);
    this.cohesion = 45;
    this.record('stragglerRescued', { regionId: this.region?.id, free: this.straggler.freeRescue });
    this.straggler = null;
    return true;
  }

  dropStraggler() {
    if (!this.straggler) return false;
    this.companions = Math.max(0, this.companions - 1);
    this.cohesion = 45;
    this.record('companionStopped', { regionId: this.region?.id, arrivedCount: this.companions });
    this.straggler = null;
    if (this.companions < RUN_CONFIG.softFailCompanions) {
      this.failed = true;
      this.phase = PHASES.JOURNAL;
      this.phaseTime = 0;
      this.record('runFailed', { arrivedCount: this.companions, cause: 'companions' });
    }
    return true;
  }

  snapshot() {
    return {
      phase: this.phase,
      regionIndex: this.regionIndex,
      regionId: this.region?.id ?? null,
      phaseTime: this.phaseTime,
      runTime: this.runTime,
      energy: this.energy,
      maxEnergy: this.maxEnergy,
      cohesion: this.cohesion,
      companions: this.companions,
      upgradeIds: [...this.upgradeIds],
      routes: [...this.routes],
      route: this.route,
      straggler: this.straggler ? { ...this.straggler } : null,
      failed: this.failed,
    };
  }
}
