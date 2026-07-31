import { PHASES, PRELUDE, REGIONS, getUpgrade } from '../domain/content.js';
import { RunModel } from '../domain/run-model.js';
import { GameUI } from '../ui/game-ui.js';
import { AudioManager } from './audio-manager.js';
import { Flock } from './flock.js';
import { getFlightEffects } from './risk-director.js';
import { WindField } from './wind-field.js';
import { WorldRenderer } from './world-renderer.js';

const FIXED_STEP = 1 / 60;
const ROUTE_WINDOW_DURATION = 7;
const ARRIVAL_DURATION = 4;
const AUDIO_STORAGE_KEY = 'south-wind-audio';
const BEST_STORAGE_KEY = 'south-wind-best';
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function readStoredBoolean(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value !== 'false';
  } catch {
    return fallback;
  }
}

function readStoredNumber(key, fallback = 0) {
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredValue(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

export class GameController {
  constructor(root) {
    if (!root) throw new Error('GameController requires a root element.');

    this.root = root;
    this.audioEnabled = readStoredBoolean(AUDIO_STORAGE_KEY, true);
    this.debugVisible = new URLSearchParams(window.location.search).get('debug') === '1';
    this.audio = new AudioManager({ enabled: this.audioEnabled });
    this.ui = new GameUI(root, {
      onStart: () => this.beginRun(),
      onToggleAudio: () => this.toggleAudio(),
      onPause: () => this.togglePause(),
      onResume: () => this.setPaused(false),
      onRestart: () => this.restart(),
      onGather: (active) => this.setGathering(active),
      onDebug: (action) => this.handleDebugAction(action),
    });
    this.renderer = new WorldRenderer(this.ui.canvas);

    this.model = null;
    this.flock = null;
    this.wind = null;
    this.started = false;
    this.paused = false;
    this.gathering = false;
    this.choiceOpen = false;
    this.currentChoices = [];
    this.pendingRegionIndex = null;
    this.routeWindow = null;
    this.journalShown = false;
    this.eventCursor = 0;
    this.activeRiskKey = null;

    this.frameId = 0;
    this.lastFrameAt = performance.now();
    this.accumulator = 0;
    this.visualTime = 0;
    this.fps = 60;
    this.lowFpsTime = 0;
    this.highFpsTime = 0;
    this.environment = this.emptyEnvironment();

    this.onFrame = this.onFrame.bind(this);
    this.onResize = this.onResize.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerEnd = this.onPointerEnd.bind(this);
    this.onVisibilityChange = this.onVisibilityChange.bind(this);

    this.createRun();
  }

  mount() {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onVisibilityChange);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.ui.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.ui.canvas.addEventListener('pointermove', this.onPointerMove);
    this.ui.canvas.addEventListener('pointerup', this.onPointerEnd);
    this.ui.canvas.addEventListener('pointercancel', this.onPointerEnd);

    this.ui.setAudio(this.audioEnabled);
    this.ui.setDebugVisible(this.debugVisible);
    this.ui.showTitle(true);
    this.lastFrameAt = performance.now();
    this.frameId = requestAnimationFrame(this.onFrame);
    return this;
  }

  destroy() {
    cancelAnimationFrame(this.frameId);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onVisibilityChange);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.ui.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.ui.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.ui.canvas.removeEventListener('pointerup', this.onPointerEnd);
    this.ui.canvas.removeEventListener('pointercancel', this.onPointerEnd);
  }

  createRun() {
    const seed = (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0;
    this.model = new RunModel(seed);
    this.flock = new Flock({ count: this.model.startedCompanions, seed });
    this.wind = new WindField();
    this.routeWindow = null;
    this.environment = this.emptyEnvironment();
    this.eventCursor = this.model.eventLog.length;
    this.activeRiskKey = null;
    this.journalShown = false;
    this.currentChoices = [];
    this.pendingRegionIndex = null;
    this.choiceOpen = false;
    this.gathering = false;
    this.ui.setGathering(false, 1);
  }

  beginRun() {
    if (this.started && !this.journalShown) return;
    if (this.journalShown) this.createRun();

    this.started = true;
    this.paused = false;
    this.ui.hideJournal();
    this.ui.hideChoice();
    this.ui.setPaused(false);
    this.ui.showTitle(false);
    this.setGameplayControlsVisible(true);
    this.renderer.setTheme(PRELUDE.theme);
    this.audio.setTheme(PRELUDE.theme);
    this.audio.start().catch(() => {});
    this.ui.toast('南风从河口以南升起。');
  }

  restart() {
    this.createRun();
    this.started = false;
    this.ui.hideJournal();
    this.beginRun();
  }

  toggleAudio() {
    this.audioEnabled = !this.audioEnabled;
    this.audio.setEnabled(this.audioEnabled);
    this.ui.setAudio(this.audioEnabled);
    writeStoredValue(AUDIO_STORAGE_KEY, this.audioEnabled);
    if (this.audioEnabled && this.started) this.audio.start().catch(() => {});
  }

  togglePause() {
    this.setPaused(!this.paused);
  }

  setPaused(paused) {
    if (!this.canPause()) return;
    this.paused = Boolean(paused);
    this.setGathering(false);
    this.wind.cancel();
    this.accumulator = 0;
    this.ui.setPaused(this.paused);
  }

  canPause() {
    return this.started && !this.choiceOpen && !this.journalShown;
  }

  setGathering(active) {
    const interactive = this.started
      && !this.paused
      && !this.choiceOpen
      && [PHASES.PRELUDE, PHASES.FLIGHT, PHASES.ROUTE_CHOICE].includes(this.model.phase);
    this.gathering = Boolean(active) && interactive;
  }

  setGameplayControlsVisible(visible) {
    this.ui.elements.gatherButton.hidden = !visible;
    this.ui.elements.pauseButton.hidden = !visible;
  }

  showUpgradeChoice({ first = false, nextRegionIndex }) {
    this.model.startStopover();
    this.choiceOpen = true;
    this.pendingRegionIndex = nextRegionIndex;
    this.currentChoices = this.model.getUpgradeChoices(3);
    this.setGathering(false);
    this.wind.cancel();
    this.setGameplayControlsVisible(false);
    this.ui.showUpgradeChoice(
      this.currentChoices,
      (choice) => this.selectUpgrade(choice),
      { first },
    );
  }

  selectUpgrade(choice) {
    if (!this.choiceOpen || !choice || !this.model.applyUpgrade(choice.id)) return;
    const nextRegionIndex = this.pendingRegionIndex;
    this.choiceOpen = false;
    this.pendingRegionIndex = null;
    this.currentChoices = [];
    this.ui.hideChoice();
    this.audio.playCue('upgrade');
    this.flock.triggerPulse();
    this.ui.toast(choice.feedback, 'good');

    if (Number.isInteger(nextRegionIndex)) this.startRegion(nextRegionIndex);
  }

  startRegion(index) {
    const region = REGIONS[index];
    if (!region) {
      this.startArrival();
      return;
    }

    this.model.startRegion(index);
    this.routeWindow = null;
    this.activeRiskKey = null;
    this.renderer.setTheme(region.theme);
    this.audio.setTheme(region.theme);
    this.ui.showRegion(index, region);
    this.setGameplayControlsVisible(true);
  }

  openRouteWindow() {
    if (this.model.phase !== PHASES.FLIGHT || !this.model.region || this.model.routeResolved) return;
    const safeTop = this.model.random() >= 0.5;
    this.routeWindow = {
      active: true,
      remaining: ROUTE_WINDOW_DURATION,
      safeTop,
      safe: this.model.region.safeRoute,
      risky: this.model.region.riskyRoute,
    };
    this.model.phase = PHASES.ROUTE_CHOICE;
    this.activeRiskKey = null;
    this.audio.playCue('warning');
    this.flock.triggerPulse();
  }

  resolveRoute(kind) {
    if (this.model.phase !== PHASES.ROUTE_CHOICE || !this.routeWindow) return;
    const route = this.model.chooseRoute(kind);
    if (!route) return;

    this.model.phase = PHASES.FLIGHT;
    this.routeWindow = null;
    this.audio.playCue('route');
    this.flock.triggerPulse();
    this.ui.toast(`${route.name} · ${route.detail}`, route.kind === 'safe' ? 'good' : 'neutral');
  }

  updateRouteWindow(dt) {
    if (!this.routeWindow) return;
    this.model.advanceClock(dt);
    this.routeWindow.remaining = Math.max(0, this.routeWindow.remaining - dt);

    if (this.routeWindow.remaining <= 0) {
      const center = this.flock.getCenter();
      const choseTop = center.y < 0.5;
      const choseSafe = choseTop === this.routeWindow.safeTop;
      this.resolveRoute(choseSafe ? 'safe' : 'risky');
    }
  }

  completeRegion() {
    const nextRegionIndex = this.model.regionIndex + 1;
    if (nextRegionIndex < REGIONS.length) {
      this.showUpgradeChoice({ nextRegionIndex });
    } else {
      this.startArrival();
    }
  }

  startArrival() {
    this.model.arrive();
    this.routeWindow = null;
    this.setGathering(false);
    this.wind.cancel();
    this.setGameplayControlsVisible(false);
    this.audio.playCue('arrival');
    this.flock.triggerPulse();
    this.ui.toast('最后一道山脊从风中显现。', 'good', 3200);
  }

  showJournal() {
    if (this.journalShown) return;
    if (this.model.phase !== PHASES.JOURNAL) this.model.finishJournal();
    this.journalShown = true;
    this.paused = false;
    this.choiceOpen = false;
    this.routeWindow = null;
    this.setGathering(false);
    this.ui.setPaused(false);
    this.ui.hideChoice();
    this.ui.setRouteWindow(null);
    this.ui.setStraggler(null);

    const previousBest = readStoredNumber(BEST_STORAGE_KEY, 0);
    const best = Math.max(previousBest, this.model.companions);
    writeStoredValue(BEST_STORAGE_KEY, best);
    this.ui.showJournal({
      failed: this.model.failed,
      companions: this.model.companions,
      startedCompanions: this.model.startedCompanions,
      best,
      routes: this.model.routes,
      upgrades: this.model.upgradeIds.map(getUpgrade).filter(Boolean),
      duration: this.model.runTime,
    });
  }

  onFrame(timestamp) {
    const rawDt = Math.max(0, (timestamp - this.lastFrameAt) / 1000);
    const frameDt = Math.min(0.1, rawDt);
    this.lastFrameAt = timestamp;
    this.visualTime += this.paused ? 0 : frameDt;
    this.updatePerformance(rawDt);

    if (this.started && !this.paused && !this.choiceOpen && !this.journalShown) {
      this.accumulator = Math.min(this.accumulator + frameDt, FIXED_STEP * 6);
      while (this.accumulator >= FIXED_STEP) {
        this.update(FIXED_STEP, timestamp / 1000);
        this.accumulator -= FIXED_STEP;
      }
    } else {
      this.accumulator = 0;
    }

    this.render(frameDt, timestamp / 1000);
    this.frameId = requestAnimationFrame(this.onFrame);
  }

  update(dt, now) {
    this.wind.update(now, dt);

    if (this.model.phase === PHASES.ARRIVAL) {
      this.model.advanceClock(dt);
      this.updateFlock(dt, this.emptyEnvironment());
      if (this.model.phaseTime >= ARRIVAL_DURATION) this.showJournal();
      return;
    }

    if (this.model.phase === PHASES.JOURNAL) {
      this.showJournal();
      return;
    }

    if (this.model.phase === PHASES.ROUTE_CHOICE) {
      const environment = this.emptyEnvironment();
      this.updateFlock(dt, environment);
      this.updateRouteWindow(dt);
      this.audio.update(dt, { gathering: this.gathering });
      this.environment = environment;
      return;
    }

    const environment = this.computeEnvironment();
    this.model.update(dt, {
      gathering: this.gathering,
      riskPressure: environment.riskPressure,
      sharpness: this.wind.getInfluence().sharpness,
      safeCurrent: environment.safeCurrent.active,
    });
    this.processModelEvents();
    this.updateRiskCue(environment.riskInfo);
    this.updateFlock(dt, environment);
    this.audio.update(dt, {
      risk: environment.riskPressure,
      gathering: this.gathering,
      safeCurrent: environment.safeCurrent.active,
    });
    this.environment = environment;

    if (this.model.phase === PHASES.JOURNAL) {
      this.showJournal();
      return;
    }

    if (this.model.phase === PHASES.PRELUDE && this.model.phaseTime >= PRELUDE.duration && !this.model.straggler) {
      this.showUpgradeChoice({ first: true, nextRegionIndex: 0 });
      return;
    }

    if (this.model.phase === PHASES.FLIGHT) {
      const region = this.model.region;
      if (!this.model.routeResolved && this.model.phaseTime >= region.routeAt) {
        this.openRouteWindow();
        return;
      }
      if (this.model.phaseTime >= region.duration + this.model.regionDurationBonus && !this.model.straggler) this.completeRegion();
    }
  }

  updateFlock(dt, environment) {
    this.flock.update(dt, {
      wind: this.wind.getInfluence(),
      gathering: this.gathering,
      energyRatio: this.model.energy / this.model.maxEnergy,
      risk: environment.riskPressure,
      hazardForce: environment.hazardForce,
      companionCount: this.model.companions,
      straggler: this.model.straggler,
    });
  }

  emptyEnvironment() {
    return {
      riskInfo: null,
      riskPressure: 0,
      hazardForce: { x: 0, y: 0 },
      safeCurrent: { visible: false, active: false, centerY: 0.5, width: 0.1, phase: 0 },
    };
  }

  computeEnvironment() {
    return getFlightEffects({
      region: this.model.phase === PHASES.FLIGHT ? this.model.region : null,
      time: this.model.phaseTime,
      center: this.flock.getCenter(),
      routeActive: this.model.phase === PHASES.ROUTE_CHOICE,
      previewLead: this.model.hasUpgrade('listen-wind') ? 4 : 2,
    });
  }

  updateRiskCue(riskInfo) {
    if (!riskInfo?.active) {
      this.activeRiskKey = null;
      return;
    }
    const key = `${this.model.region?.id ?? 'prelude'}:${riskInfo.index}`;
    if (key === this.activeRiskKey) return;
    this.activeRiskKey = key;
    this.audio.playCue('warning');
    this.flock.triggerPulse();
  }

  processModelEvents() {
    const events = this.model.eventLog.slice(this.eventCursor);
    this.eventCursor = this.model.eventLog.length;
    for (const event of events) {
      if (event.type === 'stragglerStarted') {
        this.audio.playCue('warning');
        this.flock.triggerPulse();
        this.ui.toast('队形正在散开，收拢可以把同伴带回来。', 'danger');
      } else if (event.type === 'stragglerRescued') {
        this.audio.playCue('rescue');
        this.flock.triggerPulse();
        this.ui.toast('同伴重新跟上了队形。', 'good');
      } else if (event.type === 'companionStopped') {
        this.audio.playCue('loss');
        this.ui.toast('一只候鸟停在了沿途。', 'danger');
      } else if (event.type === 'followSeasonTriggered') {
        this.audio.playCue('upgrade');
        this.ui.toast('顺季带回了体力与凝聚。', 'good');
      }
    }
  }

  render(dt, now) {
    const environment = this.model.phase === PHASES.ROUTE_CHOICE
      ? this.emptyEnvironment()
      : this.environment;
    const progress = this.getProgress();
    const regionName = this.model.region?.name ?? PRELUDE.name;

    this.renderer.render({
      dt,
      time: this.visualTime,
      progress,
      flock: this.flock,
      model: this.model,
      windPoints: this.wind.getRenderablePoints(now),
      safeCurrent: environment.safeCurrent,
      riskInfo: environment.riskInfo,
      routeWindow: this.routeWindow,
      paused: this.paused,
    });
    this.ui.updateHud({
      model: this.model,
      progress,
      regionName,
      fps: this.fps,
      gathering: this.gathering,
    });
    this.ui.setRouteWindow(this.routeWindow);
    this.ui.setStraggler(this.model.straggler);
  }

  getProgress() {
    if (this.model.phase === PHASES.PRELUDE) return clamp(this.model.phaseTime / PRELUDE.duration, 0, 1);
    if (this.model.region) {
      const duration = this.model.region.duration + this.model.regionDurationBonus;
      return clamp(this.model.phaseTime / duration, 0, 1);
    }
    return this.model.phase === PHASES.JOURNAL || this.model.phase === PHASES.ARRIVAL ? 1 : 0;
  }

  updatePerformance(rawDt) {
    if (rawDt > 0 && rawDt < 0.5) {
      const instantFps = 1 / rawDt;
      this.fps += (instantFps - this.fps) * 0.08;
    }

    if (this.fps < 45) {
      this.lowFpsTime += Math.min(rawDt, 0.1);
      this.highFpsTime = 0;
    } else if (this.fps > 54) {
      this.highFpsTime += Math.min(rawDt, 0.1);
      this.lowFpsTime = 0;
    } else {
      this.lowFpsTime = 0;
      this.highFpsTime = 0;
    }

    if (this.lowFpsTime >= 3) {
      this.renderer.setQuality(0.62);
      this.lowFpsTime = 0;
    } else if (this.highFpsTime >= 6) {
      this.renderer.setQuality(1);
      this.highFpsTime = 0;
    }
  }

  handleDebugAction(action) {
    if (action === 'energy') {
      this.model.energy = this.model.maxEnergy;
      this.ui.toast('体力已补充。', 'good');
      return;
    }
    if (action === 'cohesion') {
      this.model.cohesion = 0;
      this.ui.toast('凝聚已归零。', 'danger');
      return;
    }
    if (action === 'route') {
      if (this.model.phase === PHASES.FLIGHT && !this.model.routeResolved) {
        this.model.phaseTime = Math.max(this.model.phaseTime, this.model.region.routeAt);
        this.openRouteWindow();
      }
      return;
    }
    if (action === 'next') this.debugNextPhase();
  }

  debugNextPhase() {
    if (!this.started) {
      this.beginRun();
      return;
    }
    if (this.paused) this.setPaused(false);
    if (this.model.straggler) {
      this.model.dropStraggler();
      this.processModelEvents();
      if (this.model.phase === PHASES.JOURNAL) {
        this.showJournal();
        return;
      }
    }
    if (this.choiceOpen) {
      this.selectUpgrade(this.currentChoices[0]);
      return;
    }
    if (this.model.phase === PHASES.PRELUDE) {
      this.model.phaseTime = PRELUDE.duration;
      this.showUpgradeChoice({ first: true, nextRegionIndex: 0 });
      return;
    }
    if (this.model.phase === PHASES.ROUTE_CHOICE) this.resolveRoute('safe');
    if (this.model.phase === PHASES.FLIGHT) {
      if (!this.model.routeResolved) this.model.chooseRoute('safe');
      this.model.phaseTime = this.model.region.duration + this.model.regionDurationBonus;
      this.completeRegion();
      return;
    }
    if (this.model.phase === PHASES.ARRIVAL) this.showJournal();
  }

  onResize() {
    this.renderer.resize();
  }

  onKeyDown(event) {
    const target = event.target;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
    if (typing) return;

    if (event.code === 'KeyD' && !event.repeat) {
      this.debugVisible = !this.debugVisible;
      this.ui.setDebugVisible(this.debugVisible);
      return;
    }
    if (event.code === 'Escape' && !event.repeat && this.canPause()) {
      event.preventDefault();
      this.togglePause();
      return;
    }
    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) this.setGathering(true);
    }
  }

  onKeyUp(event) {
    if (event.code !== 'Space') return;
    event.preventDefault();
    this.setGathering(false);
  }

  onPointerDown(event) {
    if (!this.canUseWind()) return;
    event.preventDefault();
    this.ui.canvas.setPointerCapture?.(event.pointerId);
    this.wind.begin(event.pointerId, this.normalizedPoint(event), performance.now() / 1000);
  }

  onPointerMove(event) {
    if (!this.canUseWind()) return;
    if (this.wind.move(event.pointerId, this.normalizedPoint(event), performance.now() / 1000)) event.preventDefault();
  }

  onPointerEnd(event) {
    this.wind.end(event.pointerId);
  }

  canUseWind() {
    return this.started
      && !this.paused
      && !this.choiceOpen
      && [PHASES.PRELUDE, PHASES.FLIGHT, PHASES.ROUTE_CHOICE].includes(this.model.phase);
  }

  normalizedPoint(event) {
    const rect = this.ui.canvas.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1),
      y: clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1),
    };
  }

  onVisibilityChange() {
    if ((document.hidden || !document.hasFocus()) && this.canPause()) this.setPaused(true);
  }
}
