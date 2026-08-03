import { combatPhase } from "../content/gameplay-rules.js";

export const ENEMY_ORDER = [
  "scout",
  "gunner",
  "spinner",
  "sniper",
  "bomber",
  "mineLayer",
  "splitter",
  "fighter",
  "helicopter",
  "elite",
];

export const ENEMY_CONFIGS = {
  scout: { name: "高速突击机", radius: 13, health: (wave) => 1 + Math.floor(wave / 7), speed: 156, drift: 86, score: 110, fire: "none", color: "#e0524d" },
  gunner: { name: "双炮战舰", radius: 22, health: (wave) => 5 + wave, speed: 82, drift: 44, score: 280, fire: "aim", color: "#b8443f" },
  spinner: { name: "旋转弹幕机", radius: 19, health: (wave) => 4 + wave, speed: 96, drift: 34, score: 360, fire: "fan", color: "#ca5f43" },
  sniper: { name: "狙击机", radius: 17, health: (wave) => 3 + Math.ceil(wave * 0.85), speed: 104, drift: 64, score: 330, fire: "snipe", color: "#2f7695" },
  bomber: { name: "轰炸机", radius: 24, health: (wave) => 7 + Math.ceil(wave * 1.25), speed: 64, drift: 26, score: 430, fire: "burst", color: "#995676" },
  mineLayer: { name: "布雷机", radius: 21, health: (wave) => 6 + wave, speed: 72, drift: 52, score: 390, fire: "mine", color: "#806249" },
  splitter: { name: "分裂机", radius: 26, health: (wave) => 9 + Math.ceil(wave * 1.45), speed: 70, drift: 58, score: 560, fire: "split", color: "#b48c22" },
  fighter: { name: "高速截击机", radius: 18, health: (wave) => 4 + Math.ceil(wave * 0.8), speed: 142, drift: 118, score: 410, fire: "strafe", color: "#d04646" },
  helicopter: { name: "武装直升机", radius: 25, health: (wave) => 8 + Math.ceil(wave * 1.15), speed: 58, drift: 28, score: 520, fire: "rocket", color: "#477b4f" },
  elite: { name: "重装精英", radius: 31, health: (wave) => 14 + wave * 2.2, speed: 62, drift: 30, score: 780, fire: "elite", color: "#c47b22" },
};

export function enemyTypeForSpawn(elapsed, wave, spawnCount, random = Math.random) {
  const phase = combatPhase(elapsed);
  if (phase === "identify") return "scout";
  if (phase === "learn") return random() < 0.68 ? "scout" : "gunner";
  if (phase === "expand") {
    const pool = ["scout", "gunner", "sniper", "fighter"];
    return pool[Math.floor(random() * pool.length)];
  }
  const pressure = Math.min(0.62, wave * 0.045 + elapsed / 420);
  if (spawnCount % 17 === 0 || (wave >= 6 && random() < 0.08 + pressure * 0.08)) return "elite";
  if (spawnCount % 15 === 0 || (wave >= 3 && random() < pressure * 0.1)) return "helicopter";
  if (spawnCount % 13 === 0 || random() < pressure * 0.11) return "splitter";
  if (spawnCount % 11 === 0 || random() < pressure * 0.11) return "mineLayer";
  if (spawnCount % 9 === 0 || random() < pressure * 0.12) return "bomber";
  if (spawnCount % 7 === 0 || random() < pressure * 0.13) return "sniper";
  if (spawnCount % 5 === 0 || random() < pressure * 0.15) return "spinner";
  return random() < 0.5 ? "scout" : random() < 0.52 ? "gunner" : "fighter";
}

export function difficultyFromPerformance({ current = 1, consecutiveDeaths = 0, clearStreak = 0 } = {}) {
  let next = Number.isFinite(current) ? current : 1;
  if (consecutiveDeaths >= 2) next *= 0.95;
  if (clearStreak >= 3) next *= 1.03;
  return Math.max(0.82, Math.min(1.22, next));
}

export function bossSpec(wave) {
  const health = 280 + wave * 48;
  return {
    name: `天穹堡垒 MK-${Math.ceil(wave / 4)}`,
    radius: 64,
    health,
    weaponHealth: Math.round(health * 0.24),
    score: 6000 + wave * 450,
  };
}
