import { laserModeSpec } from "../content/gameplay-rules.js";

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function weaponPreviewSpec(mode = {}) {
  const pattern = mode.pattern || "pulse";
  const laser = pattern === "laser" ? laserModeSpec(mode) : null;
  const durations = { pulse: 1.45, seeker: 2.2, wave: 1.8, rail: 1.5, heavy: 2.15, drone: 2.4, laser: Math.max(1.7, (laser?.warmup || 0) + (laser?.duration || 0) + 0.65) };
  return {
    pattern,
    style: mode.laserStyle || pattern,
    duration: durations[pattern] || 1.8,
    projectileCount: Math.min(pattern === "laser" ? 7 : 8, Math.max(1, Number(mode.count) || 1)),
    spread: Number(mode.spread) || 0,
    speed: Number(mode.speed) || 860,
    radius: pattern === "heavy" ? 8 : pattern === "wave" ? 6 : 4.5,
    pierce: pattern === "rail" ? 2 : 0,
    blastRadius: pattern === "heavy" ? 42 : 0,
    warmup: laser?.warmup || 0,
    beamDuration: laser?.duration || 0,
    width: laser?.width || 0,
    reflect: false,
  };
}

export function weaponPreviewFrame({ mode, elapsed = 0, origins = [], bounds, reducedMotion = false }) {
  const spec = weaponPreviewSpec(mode);
  const safeOrigins = origins.length ? origins : [{ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height * 0.76 }];
  const local = reducedMotion ? spec.duration * 0.55 : ((Math.max(0, elapsed) % spec.duration) + spec.duration) % spec.duration;
  const cycle = clamp01(local / spec.duration);
  const centerX = bounds.x + bounds.width / 2;
  const targetY = bounds.y + 28;
  const targets = [
    { x: centerX - bounds.width * 0.23, y: targetY + 13, kind: "light" },
    { x: centerX, y: targetY, kind: "armor" },
    { x: centerX + bounds.width * 0.23, y: targetY + 13, kind: "moving" },
  ];
  const projectiles = [];
  const beams = [];
  const explosions = [];
  const drones = [];
  let charge = null;

  if (spec.pattern === "laser") {
    const warmupRatio = spec.warmup / spec.duration;
    const beamEnd = Math.min(0.9, warmupRatio + spec.beamDuration / spec.duration);
    if (cycle < warmupRatio) {
      charge = { ...safeOrigins[0], progress: clamp01(cycle / Math.max(0.01, warmupRatio)) };
    } else if (cycle <= beamEnd) {
      const count = spec.projectileCount;
      for (let index = 0; index < count; index += 1) {
        const origin = safeOrigins[index % safeOrigins.length];
        const slot = index - (count - 1) / 2;
        const travel = Math.max(1, origin.y - (bounds.y + 4));
        const angle = slot * spec.spread;
        const target = { x: origin.x + Math.tan(angle) * travel, y: bounds.y + 4 };
        beams.push({ origin, target, width: Math.min(9, spec.width * 0.7), reflect: false, style: spec.style, index });
      }
    }
    return { spec, cycle, targets, projectiles, beams, explosions, drones, charge };
  }

  const launch = clamp01((cycle - 0.08) / 0.68);
  const impact = clamp01((cycle - 0.72) / 0.18);
  const count = spec.projectileCount;
  for (let index = 0; index < count; index += 1) {
    const origin = safeOrigins[index % safeOrigins.length];
    const slot = index - (count - 1) / 2;
    const travel = Math.max(1, origin.y - targetY);
    const endX = origin.x + Math.tan(slot * spec.spread) * travel;
    const target = targets[index % targets.length];
    if (spec.pattern === "seeker") {
      const lockDelay = clamp01((launch - index * 0.025) / 0.9);
      const point = { x: lerp(origin.x, target.x, lockDelay), y: lerp(origin.y, target.y, lockDelay) };
      projectiles.push({ ...point, angle: Math.atan2(target.y - point.y, target.x - point.x), type: "seeker", radius: spec.radius, trail: true });
    } else if (spec.pattern === "wave") {
      projectiles.push({ x: lerp(origin.x, endX, launch), y: lerp(origin.y, targetY, launch), type: "wave", radius: spec.radius });
    } else if (spec.pattern === "rail") {
      const railTravel = Math.max(1, origin.y - (bounds.y - 18));
      const end = { x: origin.x + Math.tan(slot * spec.spread) * railTravel, y: bounds.y - 18 };
      projectiles.push({ x: lerp(origin.x, end.x, launch), y: lerp(origin.y, end.y, launch), type: "rail", radius: spec.radius, origin, end, pierce: true });
    } else if (spec.pattern === "heavy") {
      const end = { x: endX, y: targetY };
      projectiles.push({ x: lerp(origin.x, end.x, launch), y: lerp(origin.y, end.y, launch), type: "heavy", radius: spec.radius });
      if (impact > 0) explosions.push({ ...end, radius: spec.blastRadius * Math.sin(impact * Math.PI), opacity: 1 - impact });
    } else if (spec.pattern === "drone") {
      const side = index % 2 ? 1 : -1;
      const drone = { x: lerp(origin.x, centerX + side * (48 + index * 5), clamp01(cycle * 2.4)), y: lerp(origin.y, bounds.y + bounds.height * 0.5, clamp01(cycle * 2.4)), side };
      drones.push(drone);
      if (cycle > 0.34) projectiles.push({ x: lerp(drone.x, targets[index % 3].x, launch), y: lerp(drone.y, targets[index % 3].y, launch), type: "pulse", radius: 3.4 });
    } else {
      projectiles.push({ x: lerp(origin.x, endX, launch), y: lerp(origin.y, targetY, launch), type: "pulse", radius: spec.radius });
    }
  }
  return { spec, cycle, targets, projectiles, beams, explosions, drones, charge };
}
