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

export const ENEMY_VISUALS = {
  scout: { silhouette: "dart", role: "侦察", engines: 1, stripe: "#ff9b78", bank: 0.28 },
  gunner: { silhouette: "twin-boom", role: "压制", engines: 2, stripe: "#ffb07b", bank: 0.14 },
  spinner: { silhouette: "disc-wing", role: "弹幕", engines: 2, stripe: "#ffd06b", bank: 0.38 },
  sniper: { silhouette: "needle", role: "狙击", engines: 1, stripe: "#72d9ff", bank: 0.18 },
  bomber: { silhouette: "heavy-wing", role: "轰炸", engines: 4, stripe: "#e898bd", bank: 0.08 },
  mineLayer: { silhouette: "cranked-wing", role: "布雷", engines: 2, stripe: "#d9b275", bank: 0.12 },
  splitter: { silhouette: "manta", role: "蜂群", engines: 3, stripe: "#ffe27a", bank: 0.2 },
  fighter: { silhouette: "swept", role: "截击", engines: 2, stripe: "#ff786f", bank: 0.34 },
  helicopter: { silhouette: "rotor", role: "对地", engines: 2, stripe: "#8ed5a0", bank: 0.16 },
  elite: { silhouette: "ace", role: "王牌", engines: 2, stripe: "#ffd56d", bank: 0.42 },
};

const BOSS_PROFILES = {
  usa: { id: "fortress-eagle", name: "堡垒鹰", title: "陆基空天指挥机", silhouette: "command-wing", accent: "#e2ad62", warning: "雷达锁定", mechanic: "radar" },
  pacific: { id: "tsunami-wing", name: "海啸", title: "重型舰载飞翼", silhouette: "carrier-wing", accent: "#62d5df", warning: "反舰齐射", mechanic: "missile" },
  arctic: { id: "white-night-ghost", name: "白夜幽灵", title: "隐身截击母机", silhouette: "stealth-diamond", accent: "#8ff1dc", warning: "光学隐身", mechanic: "cloak" },
  "sky-corridor": { id: "sky-ring", name: "天环", title: "环翼空中母舰", silhouette: "ring-carrier", accent: "#77cfff", warning: "能源扫射", mechanic: "beam" },
  "meteor-rift": { id: "doomsday-trident", name: "末日三叉戟", title: "轨道轰炸平台", silhouette: "trident", accent: "#ff906d", warning: "轨道轰炸", mechanic: "orbital" },
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

export function bossSpec(wave, mapId = "usa") {
  const health = 280 + wave * 48;
  const profile = BOSS_PROFILES[mapId] || BOSS_PROFILES.usa;
  return {
    ...profile,
    name: `${profile.name} MK-${Math.ceil(wave / 4)}`,
    radius: 64,
    health,
    weaponHealth: Math.round(health * 0.24),
    score: 6000 + wave * 450,
  };
}
