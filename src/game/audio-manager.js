const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export class AudioManager {
  constructor({ enabled = true } = {}) {
    this.enabled = enabled;
    this.started = false;
    this.context = null;
    this.windGain = null;
    this.windFilter = null;
    this.tracks = [
      new Audio('/assets/paper_wings_in_sunlight.mp3'),
      new Audio('/assets/across_the_open_plain.mp3'),
    ];
    this.tracks.forEach((track) => {
      track.loop = true;
      track.preload = 'auto';
      track.volume = 0;
    });
    this.trackTargets = [0.22, 0];
    this.theme = 'warm';
  }

  async start() {
    if (this.started) {
      if (this.context?.state === 'suspended') await this.context.resume();
      return;
    }
    this.started = true;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      this.context = new AudioContext();
      this.createWindBed();
      await this.context.resume();
    }
    await Promise.allSettled(this.tracks.map((track) => track.play()));
    this.applyEnabledState();
  }

  createWindBed() {
    const sampleRate = this.context.sampleRate;
    const buffer = this.context.createBuffer(1, sampleRate * 2, sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    this.windFilter = this.context.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 780;
    this.windGain = this.context.createGain();
    this.windGain.gain.value = 0;
    source.connect(this.windFilter).connect(this.windGain).connect(this.context.destination);
    source.start();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.applyEnabledState();
  }

  applyEnabledState() {
    const scale = this.enabled ? 1 : 0;
    this.tracks.forEach((track, index) => {
      track.volume = this.trackTargets[index] * scale;
    });
    if (this.windGain && this.context) {
      this.windGain.gain.setTargetAtTime(0, this.context.currentTime, 0.08);
    }
  }

  setTheme(theme) {
    if (theme === this.theme) return;
    this.theme = theme;
    const nightWeight = theme === 'night' ? 1 : theme === 'snow' ? 0.62 : 0;
    this.trackTargets = [0.2 * (1 - nightWeight), 0.22 * nightWeight];
  }

  update(dt, { risk = 0, gathering = false, safeCurrent = false } = {}) {
    if (!this.started) return;
    const scale = this.enabled ? 1 : 0;
    this.tracks.forEach((track, index) => {
      const target = this.trackTargets[index] * scale * (1 - clamp(risk, 0, 1) * 0.22);
      track.volume += (target - track.volume) * Math.min(1, dt * 1.1);
    });
    if (this.windGain && this.context) {
      const target = scale * (0.025 + risk * 0.11 + (gathering ? 0.035 : 0) + (safeCurrent ? 0.018 : 0));
      this.windGain.gain.setTargetAtTime(target, this.context.currentTime, 0.12);
      this.windFilter.frequency.setTargetAtTime(620 + risk * 920 + (gathering ? 260 : 0), this.context.currentTime, 0.16);
    }
  }

  playCue(type) {
    if (!this.enabled || !this.context) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const cues = {
      route: [420, 540, 0.18],
      upgrade: [520, 780, 0.34],
      rescue: [360, 660, 0.28],
      warning: [180, 130, 0.25],
      loss: [210, 110, 0.42],
      arrival: [440, 880, 0.7],
    };
    const [from, to, duration] = cues[type] ?? cues.route;
    oscillator.type = type === 'warning' || type === 'loss' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, to), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(type === 'loss' ? 0.07 : 0.045, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.05);
  }
}
