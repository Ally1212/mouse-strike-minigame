import { getFighterProfile, getToolModes } from "./fighter-profiles.js";
import { laserModeSpec } from "./gameplay-rules.js";

export const WEAPON_PATTERN_LABELS = {
  pulse: "脉冲",
  seeker: "追踪",
  wave: "波动",
  rail: "轨炮",
  heavy: "重炮",
  drone: "无人翼",
  laser: "激光",
};

function round(value, digits = 1) {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
}

function grade(value, [a, s]) {
  if (value >= s) return "S";
  if (value >= a) return "A";
  return "B";
}

export function normalizeWeaponIndex(fighterId, index = 0) {
  const modes = getToolModes(fighterId);
  return ((Math.trunc(Number(index) || 0) % modes.length) + modes.length) % modes.length;
}

export function weaponMetrics(fighterId, index = 0, options = {}) {
  const fighter = getFighterProfile(fighterId);
  const modeIndex = normalizeWeaponIndex(fighterId, index);
  const mode = fighter.toolModes[modeIndex];
  const weaponLevel = Math.max(1, Number(options.weaponLevel) || 3);
  const trajectoryLevel = Math.max(0, Number(options.trajectoryLevel) || 0);
  const levelDamage = 1 + (weaponLevel - 1) * 0.12 + trajectoryLevel * 0.08;
  const interval = Math.max(0.035, 0.16 * fighter.fireRate * (Number(mode.rate) || 1));
  const patternLabel = WEAPON_PATTERN_LABELS[mode.pattern] || "弹体";

  if (mode.pattern === "laser") {
    const spec = laserModeSpec(mode);
    const beamCount = Math.max(1, Number(mode.count) || 1);
    const damagePerSecondPerBeam = mode.damage * fighter.damage * (1 + trajectoryLevel * 0.08);
    const totalDps = damagePerSecondPerBeam * beamCount;
    const burstDamage = totalDps * spec.duration;
    return {
      fighterId,
      modeIndex,
      mode,
      kind: "laser",
      patternLabel,
      interval: round(interval, 3),
      ratePerSecond: round(1 / interval, 1),
      beamCount,
      damagePerSecondPerBeam: round(damagePerSecondPerBeam, 2),
      dps: round(totalDps, 1),
      burstDamage: round(burstDamage, 1),
      warmup: round(spec.warmup, 2),
      duration: round(spec.duration, 2),
      heat: round(spec.heat, 1),
      coolRate: round(spec.coolRate, 1),
      overheatCooldown: round(spec.overheatCooldown, 2),
      width: round(spec.width, 1),
      speed: null,
      burstGrade: grade(burstDamage, [18, 34]),
      coverageGrade: grade(beamCount * spec.width, [10, 24]),
      handling: spec.heat >= 42 ? "专家" : spec.warmup >= 0.35 ? "进阶" : "简单",
    };
  }

  const baseCount = Math.max(1, Number(mode.count) || 1);
  const projectileCount = Math.min(8, baseCount + Math.floor((weaponLevel - 1) / 2) + trajectoryLevel);
  const damagePerProjectile = mode.damage * fighter.damage * levelDamage;
  const volleyDamage = damagePerProjectile * projectileCount;
  const dps = volleyDamage / interval;
  const pierce = mode.pattern === "rail" ? 2 : 0;
  const blastRadius = mode.pattern === "heavy" ? 62 : 0;
  return {
    fighterId,
    modeIndex,
    mode,
    kind: "projectile",
    patternLabel,
    interval: round(interval, 3),
    ratePerSecond: round(1 / interval, 1),
    baseCount,
    projectileCount,
    damagePerProjectile: round(damagePerProjectile, 2),
    volleyDamage: round(volleyDamage, 1),
    dps: round(dps, 1),
    speed: Number(mode.speed) || 860,
    spread: round(Number(mode.spread) || 0, 3),
    pierce,
    blastRadius,
    burstGrade: grade(volleyDamage, [7, 13]),
    coverageGrade: grade(projectileCount + pierce * 2 + (blastRadius ? 3 : 0), [5, 8]),
    handling: mode.pattern === "heavy" ? "进阶" : mode.pattern === "rail" ? "进阶" : "简单",
  };
}

export function fighterWeaponMetrics(fighterId, options = {}) {
  return getToolModes(fighterId).map((_, index) => weaponMetrics(fighterId, index, options));
}
