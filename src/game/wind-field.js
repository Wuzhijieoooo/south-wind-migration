const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export class WindField {
  constructor({ ttl = 1.5 } = {}) {
    this.ttl = ttl;
    this.points = [];
    this.pointerDown = false;
    this.pointerId = null;
    this.sharpness = 0;
    this.lastGestureAt = -Infinity;
    this.hasDrawn = false;
  }

  begin(pointerId, point, now) {
    this.pointerDown = true;
    this.pointerId = pointerId;
    this.points = [{ ...point, at: now }];
    this.sharpness = 0;
    this.lastGestureAt = now;
    this.hasDrawn = true;
  }

  move(pointerId, point, now) {
    if (!this.pointerDown || pointerId !== this.pointerId) return false;
    const previous = this.points.at(-1);
    if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 0.004) return false;

    this.points.push({ ...point, at: now });
    if (this.points.length > 32) this.points.shift();
    this.sharpness = Math.max(this.sharpness, this.measureLatestTurn());
    this.lastGestureAt = now;
    return true;
  }

  end(pointerId) {
    if (pointerId !== undefined && pointerId !== this.pointerId) return;
    this.pointerDown = false;
    this.pointerId = null;
  }

  cancel() {
    this.pointerDown = false;
    this.pointerId = null;
  }

  update(now, dt) {
    this.points = this.points.filter((point) => now - point.at <= this.ttl);
    this.sharpness = Math.max(0, this.sharpness - dt * 0.9);
  }

  measureLatestTurn() {
    if (this.points.length < 3) return 0;
    const a = this.points.at(-3);
    const b = this.points.at(-2);
    const c = this.points.at(-1);
    const ab = { x: b.x - a.x, y: b.y - a.y };
    const bc = { x: c.x - b.x, y: c.y - b.y };
    const abLength = Math.hypot(ab.x, ab.y);
    const bcLength = Math.hypot(bc.x, bc.y);
    if (abLength < 0.002 || bcLength < 0.002) return 0;
    const dot = clamp((ab.x * bc.x + ab.y * bc.y) / (abLength * bcLength), -1, 1);
    const turn = Math.acos(dot) / Math.PI;
    const speedWeight = clamp((abLength + bcLength) * 8, 0.25, 1);
    return clamp(turn * speedWeight * 1.4, 0, 1);
  }

  getInfluence() {
    const latest = this.points.at(-1);
    if (!latest) {
      return { active: false, target: { x: 0.43, y: 0.52 }, strength: 0, sharpness: this.sharpness };
    }
    const age = Math.max(0, performance.now() / 1000 - latest.at);
    const strength = this.pointerDown ? 1 : clamp(1 - age / this.ttl, 0, 1);
    return {
      active: strength > 0.02,
      target: {
        x: clamp(latest.x, 0.16, 0.78),
        y: clamp(latest.y, 0.13, 0.87),
      },
      strength,
      sharpness: this.sharpness,
    };
  }

  getRenderablePoints(now) {
    return this.points.map((point) => ({
      x: point.x,
      y: point.y,
      alpha: clamp(1 - (now - point.at) / this.ttl, 0, 1),
    }));
  }
}
