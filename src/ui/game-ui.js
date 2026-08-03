import {
  ChevronRight,
  FastForward,
  Gauge,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  SkipForward,
  Users,
  Volume2,
  VolumeX,
  Wind,
  createIcons,
} from 'lucide';

const ICONS = { ChevronRight, FastForward, Gauge, Pause, Play, RotateCcw, Settings2, SkipForward, Users, Volume2, VolumeX, Wind };
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function formatDuration(duration) {
  const totalSeconds = Math.max(0, Math.round(Number.isFinite(duration) ? duration : 0));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

export function formatRouteNames(routes) {
  return routes.length ? routes.map((route) => route.routeName ?? route.routeId).join(' · ') : '尚未经过岔路';
}

export class GameUI {
  constructor(root, handlers = {}) {
    this.root = root;
    this.handlers = handlers;
    this.toastTimer = null;
    this.regionTimer = null;
    this.gatherPointerId = null;
    this.renderShell();
    this.collectElements();
    this.bindEvents();
    this.refreshIcons();
  }

  renderShell() {
    this.root.innerHTML = `
      <main class="game-shell" aria-label="南风来时游戏">
        <canvas id="world" aria-label="候鸟迁徙画面"></canvas>

        <header class="brand" aria-hidden="true">
          <span class="brand-cn">南风来时</span>
          <span class="brand-en">WHEN THE SOUTH WIND COMES</span>
        </header>

        <section class="hud" id="hud" hidden aria-live="polite">
          <div class="journey-progress">
            <div class="progress-copy"><span id="regionName">南风初起</span><span id="progressValue">0%</span></div>
            <div class="progress-track"><span id="progressFill"></span></div>
          </div>
          <div class="hud-metrics">
            <div class="metric energy-metric">
              <i data-lucide="wind" aria-hidden="true"></i>
              <span class="metric-label">体力</span>
              <div class="energy-track"><span id="energyFill"></span></div>
              <strong id="energyValue">100</strong>
            </div>
            <div class="metric companion-metric">
              <i data-lucide="users" aria-hidden="true"></i>
              <span class="metric-label">同行</span>
              <strong><span id="companionValue">20</span><small>/20</small></strong>
            </div>
          </div>
        </section>

        <nav class="corner-tools" aria-label="游戏控制">
          <button class="icon-button" id="audioButton" type="button" aria-label="关闭声音" title="声音">
            <i data-lucide="volume-2" aria-hidden="true"></i>
          </button>
          <button class="icon-button" id="pauseButton" type="button" aria-label="暂停" title="暂停" hidden>
            <i data-lucide="pause" aria-hidden="true"></i>
          </button>
        </nav>

        <section class="title-screen" id="titleScreen">
          <div class="title-copy">
            <p class="eyebrow">一场春季北迁</p>
            <h1>南风来时</h1>
            <p class="title-line">你不是候鸟。你是带它们北迁的南风。</p>
            <button class="primary-command" id="startButton" type="button">
              <span>开始迁徙</span><i data-lucide="chevron-right" aria-hidden="true"></i>
            </button>
          </div>
          <p class="title-footnote">MIST · NIGHT · SNOW</p>
        </section>

        <section class="choice-screen" id="choiceScreen" hidden aria-modal="true" role="dialog">
          <div class="choice-heading">
            <p class="eyebrow" id="choiceEyebrow">避风处</p>
            <h2 id="choiceTitle">风留下了三种方向</h2>
            <p id="choiceSubtitle">选择一种适应，继续北迁。</p>
          </div>
          <div class="choice-list" id="choiceList"></div>
        </section>

        <section class="pause-screen" id="pauseScreen" hidden aria-modal="true" role="dialog">
          <p class="eyebrow">风暂时停了</p>
          <h2>迁徙暂停</h2>
          <button class="primary-command" id="resumeButton" type="button">
            <i data-lucide="play" aria-hidden="true"></i><span>继续</span>
          </button>
        </section>

        <section class="journal-screen" id="journalScreen" hidden aria-modal="true" role="dialog">
          <div class="journal-copy">
            <p class="eyebrow" id="journalEyebrow">迁徙记录</p>
            <h2 id="journalTitle">风抵达了山口</h2>
            <p class="journal-poem" id="journalPoem"></p>
          </div>
          <div class="journal-stats" id="journalStats"></div>
          <div class="journal-path" id="journalPath"></div>
          <button class="primary-command" id="restartButton" type="button">
            <i data-lucide="rotate-ccw" aria-hidden="true"></i><span>再飞一次</span>
          </button>
        </section>

        <div class="route-banner" id="routeBanner" hidden aria-live="assertive">
          <span>航路正在展开</span><strong id="routeCountdown">7</strong>
        </div>

        <div class="region-title" id="regionTitle" hidden aria-live="polite">
          <span id="regionIndex">01</span>
          <div><strong id="regionTitleName">河口晨雾</strong><small id="regionSubtitle">潮水记得旧河道</small></div>
        </div>

        <div class="straggler-alert" id="stragglerAlert" hidden aria-live="assertive">
          <strong>有同伴正在掉队</strong>
          <span>收拢</span>
          <b id="stragglerTime">2.5</b>
        </div>

        <div class="event-toast" id="eventToast" hidden aria-live="polite"></div>

        <button class="gather-button" id="gatherButton" type="button" hidden aria-label="按住收拢队形">
          <i data-lucide="wind" aria-hidden="true"></i><span>收拢</span>
          <b id="gatherRing"></b>
        </button>

        <aside class="debug-panel" id="debugPanel" hidden aria-label="游戏调试工具">
          <header><i data-lucide="settings-2" aria-hidden="true"></i><strong>DevTools</strong><span id="debugFps">60 FPS</span></header>
          <output id="debugState">PRELUDE</output>
          <div class="debug-actions">
            <button type="button" data-debug="energy"><i data-lucide="gauge"></i>补充体力</button>
            <button type="button" data-debug="cohesion"><i data-lucide="users"></i>凝聚归零</button>
            <button type="button" data-debug="route"><i data-lucide="fast-forward"></i>路线门</button>
            <button type="button" data-debug="next"><i data-lucide="skip-forward"></i>下一阶段</button>
          </div>
        </aside>

        <div class="rotate-screen" aria-live="polite">
          <i data-lucide="rotate-ccw" aria-hidden="true"></i>
          <strong>请横过屏幕</strong>
          <span>南风沿着更宽的天空经过。</span>
        </div>
      </main>
    `;
  }

  collectElements() {
    const get = (id) => this.root.querySelector(`#${id}`);
    this.elements = {
      canvas: get('world'), hud: get('hud'), regionName: get('regionName'), progressValue: get('progressValue'), progressFill: get('progressFill'),
      energyValue: get('energyValue'), energyFill: get('energyFill'), companionValue: get('companionValue'), audioButton: get('audioButton'),
      pauseButton: get('pauseButton'), titleScreen: get('titleScreen'), startButton: get('startButton'), choiceScreen: get('choiceScreen'),
      choiceEyebrow: get('choiceEyebrow'), choiceTitle: get('choiceTitle'), choiceSubtitle: get('choiceSubtitle'), choiceList: get('choiceList'),
      pauseScreen: get('pauseScreen'), resumeButton: get('resumeButton'), journalScreen: get('journalScreen'), journalEyebrow: get('journalEyebrow'),
      journalTitle: get('journalTitle'), journalPoem: get('journalPoem'), journalStats: get('journalStats'), journalPath: get('journalPath'),
      restartButton: get('restartButton'), routeBanner: get('routeBanner'), routeCountdown: get('routeCountdown'), regionTitle: get('regionTitle'),
      regionIndex: get('regionIndex'), regionTitleName: get('regionTitleName'), regionSubtitle: get('regionSubtitle'), stragglerAlert: get('stragglerAlert'),
      stragglerTime: get('stragglerTime'), eventToast: get('eventToast'), gatherButton: get('gatherButton'), gatherRing: get('gatherRing'),
      debugPanel: get('debugPanel'), debugFps: get('debugFps'), debugState: get('debugState'),
    };
  }

  bindEvents() {
    const { startButton, audioButton, pauseButton, resumeButton, restartButton, gatherButton, debugPanel } = this.elements;
    startButton.addEventListener('click', () => this.handlers.onStart?.());
    audioButton.addEventListener('click', () => this.handlers.onToggleAudio?.());
    pauseButton.addEventListener('click', () => this.handlers.onPause?.());
    resumeButton.addEventListener('click', () => this.handlers.onResume?.());
    restartButton.addEventListener('click', () => this.handlers.onRestart?.());
    const gatherOn = (event) => {
      event.preventDefault();
      if (this.gatherPointerId !== null) return;
      this.gatherPointerId = event.pointerId;
      gatherButton.setPointerCapture?.(event.pointerId);
      this.handlers.onGather?.(true);
    };
    const gatherOff = (event) => {
      event.preventDefault();
      if (event.pointerId !== this.gatherPointerId) return;
      this.gatherPointerId = null;
      this.handlers.onGather?.(false);
    };
    gatherButton.addEventListener('pointerdown', gatherOn);
    gatherButton.addEventListener('pointerup', gatherOff);
    gatherButton.addEventListener('pointercancel', gatherOff);
    gatherButton.addEventListener('lostpointercapture', gatherOff);
    gatherButton.addEventListener('pointerleave', (event) => { if (event.buttons === 0) gatherOff(event); });
    debugPanel.addEventListener('click', (event) => {
      const button = event.target.closest('[data-debug]');
      if (button) this.handlers.onDebug?.(button.dataset.debug);
    });
  }

  refreshIcons() {
    createIcons({ icons: ICONS, attrs: { 'stroke-width': 1.7, 'aria-hidden': 'true' } });
  }

  get canvas() {
    return this.elements.canvas;
  }

  showTitle(visible) {
    if (visible) this.cancelGatherInput();
    this.elements.titleScreen.hidden = !visible;
    this.elements.hud.hidden = visible;
    this.elements.gatherButton.hidden = visible;
    this.elements.pauseButton.hidden = visible;
  }

  setAudio(enabled) {
    this.elements.audioButton.innerHTML = `<i data-lucide="${enabled ? 'volume-2' : 'volume-x'}" aria-hidden="true"></i>`;
    this.elements.audioButton.setAttribute('aria-label', enabled ? '关闭声音' : '打开声音');
    this.elements.audioButton.classList.toggle('is-muted', !enabled);
    this.refreshIcons();
  }

  setPaused(paused) {
    this.elements.pauseScreen.hidden = !paused;
    this.elements.pauseButton.setAttribute('aria-label', paused ? '继续' : '暂停');
  }

  setGathering(gathering, energyRatio = 1) {
    this.elements.gatherButton.classList.toggle('is-active', gathering);
    this.elements.gatherRing.style.setProperty('--energy', clamp(energyRatio, 0, 1));
  }

  updateHud({ model, progress, regionName, fps, gathering }) {
    const energyRatio = model.energy / model.maxEnergy;
    this.elements.regionName.textContent = regionName;
    this.elements.progressValue.textContent = `${Math.round(progress * 100)}%`;
    this.elements.progressFill.style.width = `${clamp(progress, 0, 1) * 100}%`;
    this.elements.energyValue.textContent = Math.round(model.energy);
    this.elements.energyFill.style.width = `${clamp(energyRatio, 0, 1) * 100}%`;
    this.elements.energyFill.dataset.level = energyRatio < 0.25 ? 'low' : energyRatio < 0.5 ? 'mid' : 'good';
    this.elements.companionValue.textContent = model.companions;
    this.setGathering(gathering, energyRatio);
    this.elements.debugFps.textContent = `${Math.round(fps)} FPS`;
    this.elements.debugState.textContent = `${model.phase} · ${model.region?.id ?? 'prelude'} · E ${Math.round(model.energy)} · C ${Math.round(model.cohesion)}`;
  }

  showUpgradeChoice(choices, onSelect, { first = false } = {}) {
    this.elements.choiceEyebrow.textContent = first ? '南风初起' : '避风处';
    this.elements.choiceTitle.textContent = first ? '鸟群记住了第一阵风' : '风留下了三种方向';
    this.elements.choiceSubtitle.textContent = '选择一种适应，继续北迁。';
    this.elements.choiceList.innerHTML = '';
    for (const choice of choices) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'choice-card';
      button.innerHTML = `<span class="choice-kind">${choice.kind}</span><strong>${choice.name}</strong><p>${choice.description}</p><small>${choice.feedback}</small><i data-lucide="chevron-right" aria-hidden="true"></i>`;
      button.addEventListener('click', () => onSelect(choice));
      this.elements.choiceList.append(button);
    }
    this.elements.choiceScreen.hidden = false;
    this.refreshIcons();
  }

  hideChoice() {
    this.elements.choiceScreen.hidden = true;
  }

  setRouteWindow(routeWindow) {
    const active = Boolean(routeWindow?.active);
    this.elements.routeBanner.hidden = !active;
    if (active) this.elements.routeCountdown.textContent = Math.max(1, Math.ceil(routeWindow.remaining));
  }

  showRegion(index, region) {
    this.elements.regionIndex.textContent = String(index + 1).padStart(2, '0');
    this.elements.regionTitleName.textContent = region.name;
    this.elements.regionSubtitle.textContent = region.subtitle;
    this.elements.regionTitle.hidden = false;
    clearTimeout(this.regionTimer);
    this.regionTimer = window.setTimeout(() => { this.elements.regionTitle.hidden = true; }, 3200);
  }

  setStraggler(straggler) {
    this.elements.stragglerAlert.hidden = !straggler;
    if (straggler) this.elements.stragglerTime.textContent = straggler.remaining.toFixed(1);
  }

  toast(message, tone = 'neutral', duration = 2200) {
    clearTimeout(this.toastTimer);
    this.elements.eventToast.textContent = message;
    this.elements.eventToast.dataset.tone = tone;
    this.elements.eventToast.hidden = false;
    this.toastTimer = window.setTimeout(() => { this.elements.eventToast.hidden = true; }, duration);
  }

  showJournal({ failed, companions, startedCompanions, best, routes, upgrades, duration }) {
    this.cancelGatherInput();
    this.elements.journalEyebrow.textContent = failed ? '沿途停栖' : '迁徙记录';
    this.elements.journalTitle.textContent = failed ? '它们在这里等待下一阵南风' : '风抵达了雪岭';
    this.elements.journalPoem.textContent = failed
      ? '迁徙不是一条笔直的线。停下，也是在等待季节。'
      : '从河口到山脊，翅膀把漫长的路写进了风里。';
    this.elements.journalStats.innerHTML = `
      <div><strong>${startedCompanions}</strong><span>出发</span></div>
      <div><strong>${companions}</strong><span>抵达</span></div>
      <div><strong>${startedCompanions - companions}</strong><span>停栖</span></div>
      <div><strong>${best}</strong><span>最佳</span></div>
      <div><strong>${formatDuration(duration)}</strong><span>用时</span></div>
    `;
    const routeText = formatRouteNames(routes);
    const upgradeText = upgrades.length ? upgrades.map((upgrade) => upgrade.name).join(' · ') : '尚未形成适应';
    this.elements.journalPath.innerHTML = `<p><span>航路</span>${routeText}</p><p><span>适应</span>${upgradeText}</p>`;
    this.elements.journalScreen.hidden = false;
    this.elements.hud.hidden = true;
    this.elements.gatherButton.hidden = true;
    this.elements.pauseButton.hidden = true;
  }

  hideJournal() {
    this.elements.journalScreen.hidden = true;
  }

  setDebugVisible(visible) {
    this.elements.debugPanel.hidden = !visible;
  }

  cancelGatherInput() {
    if (this.gatherPointerId === null) return;
    const pointerId = this.gatherPointerId;
    this.gatherPointerId = null;
    try {
      if (this.elements.gatherButton.hasPointerCapture?.(pointerId)) {
        this.elements.gatherButton.releasePointerCapture(pointerId);
      }
    } catch {
      // Pointer capture may already be released during rotation or visibility changes.
    }
    this.handlers.onGather?.(false);
  }
}
