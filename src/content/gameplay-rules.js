import { getFighterProfile, getToolModes, getWingmanSpec } from "./fighter-profiles.js";

export const TRANSFORM_CORE_COST = 3;
export const TRANSFORM_DURATION = 10;
export const AIRDROP_ESCORT_DURATION = 6;
export const PLAYER_PROJECTILE_LIMIT = 60;
export const PARTICLE_LIMIT = 110;

export function airdropRewardSpec(choice, upgraded = false) {
  if (choice === "defense") {
    return upgraded
      ? { choice, upgraded: true, healthRatio: 0.55, shieldCharges: 2, firepowerDuration: 0, trajectoryLevels: 0, wingmen: false }
      : { choice, upgraded: false, healthRatio: 0.35, shieldCharges: 1, firepowerDuration: 0, trajectoryLevels: 0, wingmen: false };
  }
  return upgraded
    ? { choice: "firepower", upgraded: true, healthRatio: 0, shieldCharges: 0, firepowerDuration: 20, trajectoryLevels: 1, wingmen: true }
    : { choice: "firepower", upgraded: false, healthRatio: 0, shieldCharges: 0, firepowerDuration: 20, trajectoryLevels: 1, wingmen: false };
}

export function assaultFireSpec(progress, fighterId = "") {
  const active = clamp01(progress) > 0.72;
  if (!active) {
    return { active: false, rateMultiplier: 1, projectileBonus: 0, laserBeamBonus: 0, heatMultiplier: 1 };
  }
  const hypersonic = fighterId === "hypersonic";
  return {
    active: true,
    rateMultiplier: hypersonic ? 0.5 : 0.62,
    projectileBonus: hypersonic ? 3 : 2,
    laserBeamBonus: hypersonic ? 2 : 1,
    heatMultiplier: hypersonic ? 0.62 : 0.72,
  };
}

export function combatPhase(elapsed) {
  const seconds = Math.max(0, Number(elapsed) || 0);
  if (seconds < 2) return "identify";
  if (seconds < 8) return "learn";
  if (seconds < 20) return "expand";
  return "full";
}

export function battleCadence(elapsed) {
  const cycle = Math.max(0, Number(elapsed) || 0) % 36;
  if (cycle < 5) return { id: "establish", spawnScale: 1.25, label: "战区识别" };
  if (cycle < 17) return { id: "assault", spawnScale: 0.92, label: "编队突入" };
  if (cycle < 27) return { id: "pressure", spawnScale: 0.72, label: "火力高压" };
  if (cycle < 33) return { id: "respite", spawnScale: 2.2, label: "战术喘息" };
  return { id: "climax", spawnScale: 0.62, label: "精英反扑" };
}

export function projectileBudget(elapsed, options = {}) {
  const phase = combatPhase(elapsed);
  const transformed = Boolean(options.transformed);
  const boss = Boolean(options.boss);
  return {
    player: transformed ? 48 : phase === "identify" ? 18 : phase === "learn" ? 24 : 32,
    allied: PLAYER_PROJECTILE_LIMIT,
    enemy: boss ? 42 : phase === "identify" ? 12 : phase === "learn" ? 18 : 28,
  };
}

export function laserModeSpec(mode = {}) {
  return {
    warmup: Math.max(0.08, Number(mode.warmup) || 0.25),
    duration: Math.max(0.18, (Number(mode.duration) || 0.62) * 1.2),
    heat: Math.max(1, Number(mode.heat) || 30),
    coolRate: Math.max(1, Number(mode.coolRate) || 30),
    overheatCooldown: Math.max(0.4, Number(mode.overheatCooldown) || 1.2),
    width: Math.max(2.4, (Number(mode.width) || 5) * 1.15),
    cycle: Math.max(0.55, Number(mode.cycle) || 1.2),
  };
}

export function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}
export function nextTransformProgress(progress, target, dt, duration = 1.45, restoreDuration = 0.9) {
  const current = clamp01(progress);
  const desired = target >= 0.5 ? 1 : 0;
  const transitionTime = desired === 1 ? duration : restoreDuration;
  const delta = Math.max(0, Number(dt) || 0) / Math.max(0.2, transitionTime);
  return desired === 1
    ? Math.min(1, current + delta)
    : Math.max(0, current - delta);
}

export function canEnterCoreTransform(coreCount, cost = TRANSFORM_CORE_COST) {
  return Number(coreCount) >= cost;
}

export function transformSecondsRemaining(energyPercent) {
  return Math.max(0, Math.min(100, Number(energyPercent) || 0)) / 10;
}

export function toolModeSpec(fighterId, index = 0) {
  const modes = getToolModes(fighterId);
  const normalized = ((Math.trunc(index) % modes.length) + modes.length) % modes.length;
  return modes[normalized];
}

export function tacticalSpec(fighterId) {
  return getFighterProfile(fighterId).tactical;
}

export function wingmanSpec(fighterId) {
  return getWingmanSpec(fighterId);
}

export function formationPattern(index, width) {
  const safeWidth = Math.max(320, Number(width) || 320);
  const center = safeWidth / 2;
  const patterns = [
    {
      name: "突击楔阵",
      units: [-2, -1, 0, 1, 2].map((slot) => ({
        type: slot === 0 ? "gunner" : Math.abs(slot) === 2 ? "fighter" : "scout",
        x: center + slot * 54,
        y: -60 - Math.abs(slot) * 34,
        drift: slot * 8,
      })),
    },
    {
      name: "双翼夹击",
      units: [0, 1, 2, 3, 4, 5].map((slot) => ({
        type: slot === 2 || slot === 3 ? "spinner" : slot % 2 ? "helicopter" : "bomber",
        x: slot < 3 ? 42 + slot * 38 : safeWidth - 42 - (5 - slot) * 38,
        y: -50 - (slot % 3) * 45,
        drift: slot < 3 ? 48 : -48,
      })),
    },
    {
      name: "装甲纵队",
      units: [0, 1, 2, 3, 4].map((slot) => ({
        type: slot === 2 ? "elite" : slot % 2 ? "mineLayer" : "gunner",
        x: center + (slot - 2) * 58,
        y: -54 - (slot % 2) * 42,
        drift: (slot - 2) * 5,
      })),
    },
    {
      name: "分裂蜂群",
      units: [0, 1, 2, 3, 4, 5, 6].map((slot) => ({
        type: slot === 3 ? "splitter" : slot % 3 === 0 ? "sniper" : "scout",
        x: center + (slot - 3) * 44,
        y: -42 - Math.abs(slot - 3) * 30,
        drift: (slot - 3) * 12,
      })),
    },
  ];
  return patterns[Math.abs(Math.trunc(index || 0)) % patterns.length];
}
