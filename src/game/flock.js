import { createRandom } from '../domain/random.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (a, b, amount) => a + (b - a) * amount;

export class Flock {
  constructor({ count = 20, seed = 1 } = {}) {
    const random = createRandom(seed);
    this.birds = Array.from({ length: count }, (_, index) => ({
      index,
      x: 0.42 + (random() - 0.5) * 0.12,
      y: 0.5 + (random() - 0.5) * 0.2,
      vx: 0,
      vy: 0,
      phase: random() * Math.PI * 2,
      size: lerp(0.72, 1.22, random()),
      active: true,
      alpha: 1,
    }));
    this.center = { x: 0.42, y: 0.52 };
    this.target = { ...this.center };
    this.spread = 1;
    this.gatherAmount = 0;
    this.risk = 0;
    this.pulse = 0;
    this.elapsed = 0;
    this.stragglerIndex = null;
  }

  setCompanionCount(count) {
    this.birds.forEach((bird, index) => {
      const shouldBeActive = index < count;
      if (bird.active && !shouldBeActive) bird.alpha = Math.min(bird.alpha, 0.8);
      bird.active = shouldBeActive;
    });
  }

  setStraggler(active) {
    if (!active) {
      this.stragglerIndex = null;
      return;
    }
    if (this.stragglerIndex === null) {
      const activeBirds = this.birds.filter((bird) => bird.active);
      const trailing = [...activeBirds].sort((a, b) => a.x - b.x)[0];
      this.stragglerIndex = trailing?.index ?? null;
    }
  }

  triggerPulse() {
    this.pulse = 1;
  }

  update(dt, {
    wind,
    gathering = false,
    energyRatio = 1,
    risk = 0,
    hazardForce = { x: 0, y: 0 },
    companionCount = 20,
    straggler = null,
  } = {}) {
    this.elapsed += dt;
    this.setCompanionCount(companionCount);
    this.setStraggler(Boolean(straggler));
    this.risk = lerp(this.risk, risk, Math.min(1, dt * 4));
    this.gatherAmount = lerp(this.gatherAmount, gathering ? 1 : 0, Math.min(1, dt * 5));
    this.spread = lerp(this.spread, gathering ? 0.5 : 1, Math.min(1, dt * 3.2));
    this.pulse = Math.max(0, this.pulse - dt * 1.7);

    const influence = wind ?? { active: false, target: { x: 0.43, y: 0.52 }, strength: 0 };
    const defaultTarget = { x: 0.43, y: 0.52 + Math.sin(this.elapsed * 0.17) * 0.012 };
    this.target.x = lerp(defaultTarget.x, influence.target.x, influence.strength);
    this.target.y = lerp(defaultTarget.y, influence.target.y, influence.strength);
    const response = (0.72 + energyRatio * 0.28) * (gathering ? 0.8 : 1);
    this.center.x += (this.target.x - this.center.x) * Math.min(1, dt * 2.1 * response);
    this.center.y += (this.target.y - this.center.y) * Math.min(1, dt * 2.1 * response);
    this.center.x = clamp(this.center.x + hazardForce.x * dt, 0.13, 0.82);
    this.center.y = clamp(this.center.y + hazardForce.y * dt, 0.11, 0.89);

    const activeBirds = this.birds.filter((bird) => bird.active);
    for (const bird of activeBirds) {
      const slot = this.getFormationSlot(bird.index, activeBirds.length);
      const isStraggler = bird.index === this.stragglerIndex;
      const lag = isStraggler ? 0.16 : 0;
      const targetX = this.center.x + slot.x * this.spread - lag;
      const targetY = this.center.y + slot.y * this.spread + (isStraggler ? 0.055 : 0);
      const spring = (isStraggler ? 1.2 : 3.3) * (0.7 + energyRatio * 0.3);

      bird.vx += (targetX - bird.x) * spring * dt;
      bird.vy += (targetY - bird.y) * spring * dt;
      bird.vx += hazardForce.x * dt * (0.75 + (bird.index % 5) * 0.08);
      bird.vy += hazardForce.y * dt * (0.68 + (bird.index % 7) * 0.07);
      const drag = Math.exp(-(isStraggler ? 1.7 : 2.6) * dt);
      bird.vx *= drag;
      bird.vy *= drag;
      bird.x += bird.vx * dt;
      bird.y += bird.vy * dt;
      bird.x = clamp(bird.x, 0.04, 0.94);
      bird.y = clamp(bird.y, 0.06, 0.94);
      bird.alpha = Math.min(1, bird.alpha + dt * 2);
    }

    // 只在屏幕空间施加轻量分离，保持纸鸟可辨而不过度抖动。
    for (let first = 0; first < activeBirds.length; first += 1) {
      for (let second = first + 1; second < activeBirds.length; second += 1) {
        const a = activeBirds[first];
        const b = activeBirds[second];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        const minimum = 0.018 * (0.72 + this.spread * 0.28);
        if (distance > 0 && distance < minimum) {
          const force = (minimum - distance) * dt * 2.8;
          a.x -= (dx / distance) * force;
          a.y -= (dy / distance) * force;
          b.x += (dx / distance) * force;
          b.y += (dy / distance) * force;
        }
      }
    }
  }

  getFormationSlot(index, count) {
    if (index === 0) return { x: 0.035, y: 0 };
    const row = Math.ceil(index / 2);
    const side = index % 2 === 0 ? 1 : -1;
    const depth = row / Math.max(4, Math.ceil(count / 2));
    return {
      x: -0.025 - depth * 0.18,
      y: side * (0.025 + depth * 0.17) + Math.sin(this.elapsed * 0.7 + index) * 0.004,
    };
  }

  getCenter() {
    const active = this.birds.filter((bird) => bird.active);
    if (!active.length) return { ...this.center };
    return active.reduce((sum, bird) => ({ x: sum.x + bird.x / active.length, y: sum.y + bird.y / active.length }), { x: 0, y: 0 });
  }

  getDispersion() {
    const center = this.getCenter();
    const active = this.birds.filter((bird) => bird.active);
    if (!active.length) return 0;
    return active.reduce((sum, bird) => sum + Math.hypot(bird.x - center.x, bird.y - center.y), 0) / active.length;
  }
}
