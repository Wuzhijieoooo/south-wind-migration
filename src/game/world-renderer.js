const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (a, b, amount) => a + (b - a) * amount;

const THEMES = {
  warm: {
    skyTop: '#f5f1e7', skyBottom: '#dfe8e5', ground: '#e8e3d6', field: ['#e7e1d2', '#dcdccb', '#efe8da'],
    river: '#b7d1d8', ink: '#34362f', bird: '#f7f4eb', birdShade: '#b8c5c2', accent: '#668e84', glow: '#d7a85f', fog: '#f4f2eb',
  },
  mist: {
    skyTop: '#e7eeec', skyBottom: '#bfd0d0', ground: '#dce4df', field: ['#cbd9d2', '#d8e1db', '#bfcfc7'],
    river: '#8fb4bd', ink: '#304744', bird: '#faf9f2', birdShade: '#8ba8aa', accent: '#397d78', glow: '#e8d49a', fog: '#e9f0ee',
  },
  night: {
    skyTop: '#172033', skyBottom: '#37445a', ground: '#28323f', field: ['#273443', '#303b48', '#202c39'],
    river: '#39556d', ink: '#dce6e6', bird: '#f0f3ee', birdShade: '#91a8b8', accent: '#d6ba72', glow: '#ffd980', fog: '#425269',
  },
  snow: {
    skyTop: '#d9e4e8', skyBottom: '#eef2ef', ground: '#d9e1df', field: ['#e9edeb', '#d5dfde', '#c8d6d8'],
    river: '#9ebdcc', ink: '#40545b', bird: '#fffdf7', birdShade: '#91aab3', accent: '#537e8d', glow: '#d8a46f', fog: '#edf2f1',
  },
};

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mixColor(first, second, amount) {
  const a = hexToRgb(first);
  const b = hexToRgb(second);
  return `rgb(${Math.round(lerp(a[0], b[0], amount))}, ${Math.round(lerp(a[1], b[1], amount))}, ${Math.round(lerp(a[2], b[2], amount))})`;
}

function alphaColor(color, alpha) {
  const channels = color.startsWith('#') ? hexToRgb(color) : color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!channels) return color;
  return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${clamp(alpha, 0, 1)})`;
}

function hash(value) {
  const x = Math.sin(value * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export class WorldRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    this.quality = 1;
    this.coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    this.theme = 'warm';
    this.previousTheme = 'warm';
    this.themeBlend = 1;
    this.paperPattern = null;
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width || window.innerWidth);
    const height = Math.max(1, rect.height || window.innerHeight);
    const normalDpr = this.coarsePointer ? 1.6 : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality > 0.6 ? normalDpr : 1.25);
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (this.paperPattern
      && pixelWidth === this.canvas.width
      && pixelHeight === this.canvas.height
      && Math.abs(width - this.width) < 0.5
      && Math.abs(height - this.height) < 0.5) return;

    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = pixelWidth;
    this.canvas.height = pixelHeight;
    this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.paperPattern = this.createPaperPattern();
  }

  setQuality(value) {
    const next = clamp(value, 0.5, 1);
    if (Math.abs(next - this.quality) < 0.05) return;
    this.quality = next;
    this.resize();
  }

  setTheme(theme) {
    if (!THEMES[theme] || theme === this.theme) return;
    this.previousTheme = this.theme;
    this.theme = theme;
    this.themeBlend = 0;
  }

  createPaperPattern() {
    const patternCanvas = document.createElement('canvas');
    patternCanvas.width = 96;
    patternCanvas.height = 96;
    const patternContext = patternCanvas.getContext('2d');
    patternContext.clearRect(0, 0, 96, 96);
    for (let index = 0; index < 260; index += 1) {
      const alpha = 0.018 + hash(index * 17) * 0.026;
      patternContext.fillStyle = `rgba(35, 43, 39, ${alpha})`;
      const size = hash(index * 31) > 0.9 ? 1.4 : 0.65;
      patternContext.fillRect(hash(index * 13) * 96, hash(index * 23) * 96, size, size);
    }
    return this.context.createPattern(patternCanvas, 'repeat');
  }

  getPalette() {
    const current = THEMES[this.theme];
    if (this.themeBlend >= 1) return current;
    const previous = THEMES[this.previousTheme];
    const result = {};
    for (const key of Object.keys(current)) {
      if (Array.isArray(current[key])) {
        result[key] = current[key].map((color, index) => mixColor(previous[key][index], color, this.themeBlend));
      } else {
        result[key] = mixColor(previous[key], current[key], this.themeBlend);
      }
    }
    return result;
  }

  render(frame) {
    const dt = frame.dt ?? 0;
    this.themeBlend = Math.min(1, this.themeBlend + dt * 0.42);
    const palette = this.getPalette();
    const context = this.context;
    const width = this.width;
    const height = this.height;

    context.save();
    context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawSky(context, palette, frame.time);
    this.drawLandscape(context, palette, frame.time, frame.progress ?? 0);
    this.drawThemeAtmosphere(context, palette, frame);
    this.drawSafeCurrent(context, palette, frame.safeCurrent);
    this.drawRisk(context, palette, frame.riskInfo, frame.time);
    this.drawRouteGate(context, palette, frame.routeWindow);
    this.drawWindPath(context, palette, frame.windPoints ?? []);
    this.drawFlock(context, palette, frame.flock, frame.model, frame.time);
    this.drawPaper(context);
    if (frame.paused) {
      context.fillStyle = 'rgba(20, 25, 28, 0.18)';
      context.fillRect(0, 0, width, height);
    }
    context.restore();
  }

  drawSky(context, palette, time) {
    const gradient = context.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, palette.skyTop);
    gradient.addColorStop(0.58, palette.skyBottom);
    gradient.addColorStop(1, palette.ground);
    context.fillStyle = gradient;
    context.fillRect(0, 0, this.width, this.height);

    const sunX = this.width * (0.78 + Math.sin(time * 0.01) * 0.03);
    const sunY = this.height * 0.18;
    const glow = context.createRadialGradient(sunX, sunY, 0, sunX, sunY, this.height * 0.24);
    glow.addColorStop(0, alphaColor(palette.glow, 0.27));
    glow.addColorStop(1, alphaColor(palette.glow, 0));
    context.fillStyle = glow;
    context.fillRect(0, 0, this.width, this.height * 0.6);

    if (this.theme === 'night') {
      context.fillStyle = 'rgba(231, 239, 231, 0.58)';
      const starCount = Math.round(38 * this.quality);
      for (let index = 0; index < starCount; index += 1) {
        const x = hash(index * 47) * this.width;
        const y = hash(index * 83) * this.height * 0.43;
        const size = 0.6 + hash(index * 19) * 1.2;
        context.globalAlpha = 0.25 + hash(index * 7) * 0.55;
        context.fillRect(x, y, size, size);
      }
      context.globalAlpha = 1;
    }
  }

  drawLandscape(context, palette, time) {
    const horizon = this.height * 0.31;
    const scroll = time * 42;

    if (this.theme === 'snow') this.drawMountains(context, palette, horizon, scroll);

    context.fillStyle = palette.ground;
    context.fillRect(0, horizon, this.width, this.height - horizon);

    const rows = Math.round(7 * this.quality);
    const columns = Math.round(12 * this.quality);
    for (let row = 0; row < rows; row += 1) {
      const near = row / rows;
      const farY = horizon + Math.pow(near, 1.62) * (this.height - horizon);
      const nearY = horizon + Math.pow((row + 1) / rows, 1.62) * (this.height - horizon);
      const cellWidth = lerp(this.width / (columns * 2.2), this.width / 3.8, near);
      const offset = -((scroll * (0.15 + near * 0.55)) % cellWidth);
      for (let column = -2; column < columns + 3; column += 1) {
        const left = column * cellWidth + offset;
        const jitter = (hash(row * 97 + column * 13) - 0.5) * cellWidth * 0.18;
        context.beginPath();
        context.moveTo(left + jitter, farY);
        context.lineTo(left + cellWidth * 0.92 + jitter, farY);
        context.lineTo(left + cellWidth * 1.08, nearY + 1);
        context.lineTo(left - cellWidth * 0.08, nearY + 1);
        context.closePath();
        context.fillStyle = palette.field[Math.abs(row + column) % palette.field.length];
        context.globalAlpha = 0.48 + near * 0.34;
        context.fill();
        context.strokeStyle = alphaColor(palette.ink, 0.07);
        context.lineWidth = 0.7;
        context.stroke();
      }
    }
    context.globalAlpha = 1;

    this.drawRiver(context, palette, horizon, scroll);
    this.drawSettlements(context, palette, horizon, scroll);
  }

  drawMountains(context, palette, horizon, scroll) {
    const base = horizon + 8;
    for (let layer = 0; layer < 2; layer += 1) {
      context.beginPath();
      context.moveTo(0, base);
      const step = this.width / 7;
      for (let index = 0; index <= 8; index += 1) {
        const x = index * step - (scroll * (0.02 + layer * 0.015)) % step;
        const peak = base - this.height * (0.08 + hash(index + layer * 19) * 0.13) * (1 - layer * 0.24);
        context.lineTo(x, peak);
        context.lineTo(x + step * 0.6, base);
      }
      context.lineTo(this.width, base);
      context.closePath();
      context.fillStyle = layer === 0 ? '#b6c7ca' : '#d3dedf';
      context.globalAlpha = 0.32 + layer * 0.2;
      context.fill();
    }
    context.globalAlpha = 1;
  }

  drawRiver(context, palette, horizon, scroll) {
    const riverY = this.height * 0.67 + Math.sin(scroll * 0.003) * this.height * 0.03;
    context.beginPath();
    context.moveTo(-40, riverY - this.height * 0.07);
    context.bezierCurveTo(this.width * 0.28, riverY - 110, this.width * 0.66, riverY + 80, this.width + 40, riverY - 30);
    context.lineTo(this.width + 40, riverY + this.height * 0.11);
    context.bezierCurveTo(this.width * 0.68, riverY + 150, this.width * 0.28, riverY - 10, -40, riverY + this.height * 0.05);
    context.closePath();
    context.fillStyle = palette.river;
    context.globalAlpha = 0.72;
    context.fill();
    context.strokeStyle = alphaColor(palette.ink, 0.13);
    context.lineWidth = 1;
    context.stroke();
    context.globalAlpha = 1;

    const shimmer = context.createLinearGradient(0, riverY, this.width, riverY);
    shimmer.addColorStop(0, 'rgba(255,255,255,0)');
    shimmer.addColorStop(0.55, 'rgba(255,255,255,0.22)');
    shimmer.addColorStop(1, 'rgba(255,255,255,0)');
    context.strokeStyle = shimmer;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, riverY + 8);
    context.bezierCurveTo(this.width * 0.28, riverY - 80, this.width * 0.62, riverY + 100, this.width, riverY);
    context.stroke();
  }

  drawSettlements(context, palette, horizon, scroll) {
    const count = Math.round(15 * this.quality);
    for (let index = 0; index < count; index += 1) {
      const cycle = this.width + 320;
      const baseX = hash(index * 71) * cycle;
      const x = ((baseX - scroll * (0.2 + hash(index) * 0.18)) % cycle + cycle) % cycle - 120;
      const depth = 0.36 + hash(index * 31) * 0.55;
      const y = horizon + Math.pow(depth, 1.5) * (this.height - horizon);
      const scale = lerp(0.45, 1.25, depth);
      if (hash(index * 17) > 0.55) this.drawHouse(context, x, y, 26 * scale, palette, index);
      else this.drawTree(context, x, y, 19 * scale, palette, index);
    }
  }

  drawHouse(context, x, y, size, palette, seed) {
    const height = size * (0.85 + hash(seed * 3) * 0.55);
    context.save();
    context.translate(x, y);
    context.globalAlpha = 0.5 + clamp(y / this.height, 0, 0.35);
    context.fillStyle = mixColor(palette.field[seed % palette.field.length], '#f5f2e8', 0.45);
    context.strokeStyle = alphaColor(palette.ink, 0.33);
    context.lineWidth = 0.8;
    context.beginPath();
    context.rect(-size * 0.5, -height, size, height);
    context.fill();
    context.stroke();
    context.fillStyle = palette.birdShade;
    context.beginPath();
    context.moveTo(-size * 0.62, -height);
    context.lineTo(0, -height - size * 0.46);
    context.lineTo(size * 0.62, -height);
    context.closePath();
    context.fill();
    context.stroke();
    if (this.theme === 'night') {
      context.fillStyle = 'rgba(255, 219, 129, 0.82)';
      context.fillRect(-size * 0.18, -height * 0.58, size * 0.18, size * 0.21);
    }
    context.restore();
  }

  drawTree(context, x, y, size, palette, seed) {
    context.save();
    context.translate(x, y);
    context.globalAlpha = 0.52;
    context.strokeStyle = alphaColor(palette.ink, 0.5);
    context.lineWidth = Math.max(1, size * 0.08);
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(0, -size * 1.5);
    context.stroke();
    context.fillStyle = mixColor(palette.accent, palette.ground, 0.42 + hash(seed) * 0.22);
    context.beginPath();
    context.arc(0, -size * 1.7, size * 0.65, 0, TAU);
    context.fill();
    context.restore();
  }

  drawThemeAtmosphere(context, palette, frame) {
    if (this.theme === 'mist') {
      for (let index = 0; index < 4; index += 1) {
        const y = this.height * (0.28 + index * 0.17) + Math.sin(frame.time * 0.12 + index) * 18;
        const gradient = context.createLinearGradient(0, y - 50, 0, y + 70);
        gradient.addColorStop(0, alphaColor(palette.fog, 0));
        gradient.addColorStop(0.5, alphaColor(palette.fog, index % 2 ? 0.45 : 0.33));
        gradient.addColorStop(1, alphaColor(palette.fog, 0));
        context.fillStyle = gradient;
        context.fillRect(0, y - 50, this.width, 120);
      }
    }

    if (this.theme === 'snow') {
      context.strokeStyle = 'rgba(255, 255, 255, 0.62)';
      context.lineWidth = 1;
      const count = Math.round(70 * this.quality);
      for (let index = 0; index < count; index += 1) {
        const x = ((hash(index * 43) * this.width + frame.time * 36 * (0.5 + hash(index))) % (this.width + 40)) - 20;
        const y = ((hash(index * 67) * this.height + frame.time * 55 * (0.7 + hash(index * 9))) % (this.height + 20)) - 10;
        context.globalAlpha = 0.25 + hash(index * 23) * 0.55;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + 5, y + 2);
        context.stroke();
      }
      context.globalAlpha = 1;
    }
  }

  drawSafeCurrent(context, palette, current) {
    if (!current?.visible) return;
    const y = current.centerY * this.height;
    const half = (current.width ?? 0.1) * this.height;
    const gradient = context.createLinearGradient(0, y - half, 0, y + half);
    gradient.addColorStop(0, alphaColor(palette.accent, 0));
    gradient.addColorStop(0.48, alphaColor(palette.accent, current.active ? 0.2 : 0.1));
    gradient.addColorStop(1, alphaColor(palette.accent, 0));
    context.fillStyle = gradient;
    context.fillRect(0, y - half, this.width, half * 2);
    context.strokeStyle = alphaColor(palette.accent, current.active ? 0.66 : 0.38);
    context.lineWidth = current.active ? 2.2 : 1.1;
    context.setLineDash([14, 12]);
    context.beginPath();
    for (let x = -20; x <= this.width + 20; x += 24) {
      const waveY = y + Math.sin(x * 0.018 + current.phase) * half * 0.22;
      if (x === -20) context.moveTo(x, waveY);
      else context.lineTo(x, waveY);
    }
    context.stroke();
    context.setLineDash([]);
  }

  drawRisk(context, palette, risk, time) {
    if (!risk || (!risk.active && !risk.preview)) return;
    const intensity = risk.active ? risk.intensity : 0.24;
    if (risk.type === 'fog') {
      const corridor = risk.safeY * this.height;
      context.fillStyle = `rgba(238, 244, 241, ${0.18 + intensity * 0.34})`;
      context.fillRect(0, 0, this.width, Math.max(0, corridor - this.height * 0.1));
      context.fillRect(0, corridor + this.height * 0.1, this.width, this.height);
      context.strokeStyle = alphaColor(palette.accent, risk.preview ? 0.52 : 0.26);
      context.lineWidth = 1.3;
      context.setLineDash([8, 13]);
      context.beginPath();
      context.moveTo(0, corridor);
      context.lineTo(this.width, corridor + Math.sin(time) * 8);
      context.stroke();
      context.setLineDash([]);
    } else if (risk.type === 'lights') {
      for (const side of [-1, 1]) {
        const x = this.width * (side < 0 ? 0.16 : 0.84);
        const y = this.height * (side < 0 ? 0.2 : 0.8);
        const radius = this.height * (0.16 + intensity * 0.1);
        const light = context.createRadialGradient(x, y, 0, x, y, radius);
        light.addColorStop(0, `rgba(255, 218, 119, ${0.18 + intensity * 0.35})`);
        light.addColorStop(1, 'rgba(255, 218, 119, 0)');
        context.fillStyle = light;
        context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
    } else if (risk.type === 'gust') {
      const direction = risk.direction || 1;
      context.strokeStyle = `rgba(75, 112, 126, ${0.18 + intensity * 0.45})`;
      context.lineWidth = risk.active ? 2 : 1;
      const count = Math.round(16 * this.quality);
      for (let index = 0; index < count; index += 1) {
        const offset = ((time * 180 + index * 97) % (this.width + 260)) - 130;
        const x = direction > 0 ? offset : this.width - offset;
        const y = hash(index * 73) * this.height;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x - direction * (70 + intensity * 90), y + direction * 24);
        context.stroke();
      }
    }
  }

  drawRouteGate(context, palette, route) {
    if (!route?.active) return;
    const safeY = (route.safeTop ? 0.29 : 0.71) * this.height;
    const riskyY = (route.safeTop ? 0.71 : 0.29) * this.height;
    const drawLane = (y, safe) => {
      context.save();
      context.strokeStyle = safe ? alphaColor(palette.accent, 0.78) : 'rgba(197, 116, 90, 0.78)';
      context.fillStyle = safe ? alphaColor(palette.accent, 0.1) : 'rgba(197, 116, 90, 0.10)';
      context.lineWidth = 1.4;
      context.setLineDash([11, 9]);
      context.beginPath();
      context.roundRect(this.width * 0.7, y - this.height * 0.105, this.width * 0.24, this.height * 0.21, 6);
      context.fill();
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = palette.ink;
      context.font = '600 13px system-ui, sans-serif';
      context.textAlign = 'center';
      context.fillText(safe ? route.safe.name : route.risky.name, this.width * 0.82, y - 5);
      context.globalAlpha = 0.72;
      context.font = '12px system-ui, sans-serif';
      context.fillText(safe ? route.safe.detail : route.risky.detail, this.width * 0.82, y + 17);
      context.restore();
    };
    drawLane(safeY, true);
    drawLane(riskyY, false);
  }

  drawWindPath(context, palette, points) {
    if (points.length < 2) return;
    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';
    const shadowsEnabled = this.quality > 0.75 && !this.coarsePointer;
    context.shadowColor = shadowsEnabled ? alphaColor(palette.accent, 0.53) : 'transparent';
    context.shadowBlur = shadowsEnabled ? 12 : 0;
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const point = points[index];
      context.strokeStyle = alphaColor(palette.accent, point.alpha * 0.59);
      context.lineWidth = 2 + point.alpha * 8;
      context.beginPath();
      context.moveTo(previous.x * this.width, previous.y * this.height);
      context.lineTo(point.x * this.width, point.y * this.height);
      context.stroke();
    }
    context.restore();
  }

  drawFlock(context, palette, flock, model, time) {
    if (!flock) return;
    const straggler = flock.stragglerIndex;
    if (straggler !== null) {
      const bird = flock.birds[straggler];
      const center = flock.getCenter();
      context.strokeStyle = alphaColor(palette.accent, 0.53);
      context.lineWidth = 1.5;
      context.setLineDash([5, 7]);
      context.beginPath();
      context.moveTo(bird.x * this.width, bird.y * this.height);
      context.lineTo(center.x * this.width, center.y * this.height);
      context.stroke();
      context.setLineDash([]);
    }

    if (flock.pulse > 0) {
      const center = flock.getCenter();
      context.strokeStyle = alphaColor(palette.accent, flock.pulse * 0.67);
      context.lineWidth = 2;
      context.beginPath();
      context.arc(center.x * this.width, center.y * this.height, (1 - flock.pulse) * 120 + 28, 0, TAU);
      context.stroke();
    }

    const shadowsEnabled = this.quality > 0.75 && !this.coarsePointer;
    for (const bird of flock.birds) {
      if (!bird.active && bird.alpha <= 0) continue;
      if (!bird.active) bird.alpha = Math.max(0, bird.alpha - 0.018);
      const x = bird.x * this.width;
      const y = bird.y * this.height;
      const speed = Math.hypot(bird.vx, bird.vy);
      const angle = Math.atan2(bird.vy, Math.max(0.02, bird.vx + 0.06));
      const wing = Math.sin(time * (7 + speed * 18) + bird.phase) * 0.48;
      const baseSize = clamp(this.height / 58, 9, 18) * bird.size;
      const riskLift = 1 + flock.risk * 0.12;

      context.save();
      context.translate(x, y);
      context.rotate(angle * 0.42);
      context.globalAlpha = bird.alpha;
      context.shadowColor = shadowsEnabled
        ? (this.theme === 'night' ? 'rgba(212, 229, 236, 0.28)' : 'rgba(45, 55, 53, 0.14)')
        : 'transparent';
      context.shadowBlur = shadowsEnabled ? (this.theme === 'night' ? 10 : 5) : 0;
      context.strokeStyle = alphaColor(palette.ink, 0.6);
      context.lineWidth = 0.8;

      context.fillStyle = palette.bird;
      context.beginPath();
      context.moveTo(baseSize * 1.15, 0);
      context.lineTo(-baseSize * 0.72, -baseSize * (0.36 + wing * 0.34) * riskLift);
      context.lineTo(-baseSize * 0.28, 0);
      context.lineTo(-baseSize * 0.72, baseSize * (0.36 + wing * 0.34) * riskLift);
      context.closePath();
      context.fill();
      context.stroke();

      context.fillStyle = palette.birdShade;
      context.globalAlpha *= 0.72;
      context.beginPath();
      context.moveTo(baseSize * 1.15, 0);
      context.lineTo(-baseSize * 0.72, baseSize * (0.36 + wing * 0.34) * riskLift);
      context.lineTo(-baseSize * 0.12, 0);
      context.closePath();
      context.fill();
      context.restore();
    }

    if (model?.straggler) {
      const bird = flock.birds[straggler];
      if (bird) {
        const progress = clamp(model.straggler.remaining / model.straggler.duration, 0, 1);
        context.strokeStyle = `rgba(182, 87, 72, ${0.45 + (1 - progress) * 0.4})`;
        context.lineWidth = 2.5;
        context.beginPath();
        context.arc(bird.x * this.width, bird.y * this.height, 18 + (1 - progress) * 8, -Math.PI / 2, -Math.PI / 2 + TAU * progress);
        context.stroke();
      }
    }
  }

  drawPaper(context) {
    if (!this.paperPattern) return;
    context.save();
    context.globalAlpha = 0.55;
    context.fillStyle = this.paperPattern;
    context.fillRect(0, 0, this.width, this.height);
    context.restore();
  }
}
