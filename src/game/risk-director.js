const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function getWindowState(windows, time, previewLead) {
  for (let index = 0; index < windows.length; index += 1) {
    const [start, end] = windows[index];
    if (time >= start && time <= end) {
      const edge = Math.min((time - start) / 2.4, (end - time) / 2.4);
      return { active: true, preview: false, index, intensity: clamp(edge, 0.35, 1) };
    }
    if (time >= start - previewLead && time < start) {
      return { active: false, preview: true, index, intensity: clamp((time - start + previewLead) / previewLead, 0, 1) };
    }
  }
  return { active: false, preview: false, index: -1, intensity: 0 };
}

export function getFlightEffects({ region, time, center, routeActive = false, previewLead = 2 }) {
  if (!region) return createPreludeEffects(time, center);
  const window = routeActive ? { active: false, preview: false, index: -1, intensity: 0 } : getWindowState(region.riskWindows, time, previewLead);
  const safeCurrent = createSafeCurrent(time, center, window.active || routeActive, previewLead);
  const base = {
    riskPressure: 0,
    hazardForce: { x: 0, y: 0 },
    riskInfo: null,
    safeCurrent,
    riskActive: window.active,
  };
  if (!window.active && !window.preview) return base;

  if (region.hazard === 'fog') {
    const safeY = 0.5 + Math.sin(time * 0.19 + window.index) * 0.16;
    const distance = Math.abs(center.y - safeY);
    const outside = clamp((distance - 0.075) / 0.18, 0, 1);
    return {
      ...base,
      riskPressure: window.active ? (0.25 + outside * 0.75) * window.intensity : 0,
      hazardForce: window.active ? { x: -0.012, y: (safeY - center.y) * 0.12 } : { x: 0, y: 0 },
      riskInfo: { type: 'fog', ...window, safeY },
    };
  }

  if (region.hazard === 'lights') {
    const direction = window.index % 2 === 0 ? -1 : 1;
    const attraction = direction < 0 ? clamp((0.62 - center.y) / 0.5, 0.15, 1) : clamp((center.y - 0.38) / 0.5, 0.15, 1);
    return {
      ...base,
      riskPressure: window.active ? (0.42 + attraction * 0.58) * window.intensity : 0,
      hazardForce: window.active ? { x: -0.006, y: direction * (0.032 + window.intensity * 0.045) } : { x: 0, y: 0 },
      riskInfo: { type: 'lights', ...window, direction },
    };
  }

  const direction = window.index % 2 === 0 ? 1 : -1;
  return {
    ...base,
    riskPressure: window.active ? (0.62 + window.intensity * 0.38) : 0,
    hazardForce: window.active ? { x: -0.015, y: direction * (0.075 + window.intensity * 0.08) } : { x: 0, y: 0 },
    riskInfo: { type: 'gust', ...window, direction },
  };
}

function createPreludeEffects(time, center) {
  const safeCurrent = {
    visible: time > 7,
    active: time > 8 && time < 31 && Math.abs(center.y - (0.52 + Math.sin(time * 0.23) * 0.08)) < 0.11,
    centerY: 0.52 + Math.sin(time * 0.23) * 0.08,
    width: 0.11,
    phase: time * 1.4,
  };
  return { riskPressure: 0, hazardForce: { x: 0, y: 0 }, riskInfo: null, safeCurrent, riskActive: false };
}

function createSafeCurrent(time, center, blocked, previewLead) {
  const cycle = 16;
  const local = time % cycle;
  const centerY = 0.5 + Math.sin(Math.floor(time / cycle) * 1.7 + time * 0.08) * 0.2;
  const visible = !blocked && local >= Math.max(0, 2.5 - previewLead) && local <= 9.5;
  const active = visible && local >= 2.5 && local <= 8.5 && Math.abs(center.y - centerY) < 0.095;
  return { visible, active, centerY, width: 0.095, phase: time * 1.2 };
}
