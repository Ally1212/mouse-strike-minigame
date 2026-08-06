export const MAP_ORDER = ["usa", "pacific", "arctic", "sky-corridor", "meteor-rift"];

export const BATTLE_MAPS = {
  usa: {
    id: "usa",
    name: "美国领空",
    code: "US AIRSPACE",
    description: "雷达墙与防空平台构成标准战区，空投出现频率更高。",
    feature: "雷达墙 · 航道门 · 空投增援",
    background: "#e7eef2",
    grid: "rgba(38, 65, 78, 0.12)",
    accent: "#2f6f91",
    structureSpeed: 58,
    event: "debris",
    airdropBias: "wingman",
    objective: "突入地下空军基地并摧毁雷达阵列",
    bossId: "fortress-eagle",
  },
  pacific: {
    id: "pacific",
    name: "太平洋风暴线",
    code: "PACIFIC STORM",
    description: "穿越航母残骸和漂浮货柜，雷暴会连锁清除敌弹。",
    feature: "舰体残骸 · 漂浮货柜 · 雷暴链",
    background: "#dcecf0",
    grid: "rgba(34, 90, 101, 0.13)",
    accent: "#237f8d",
    structureSpeed: 66,
    event: "lightning",
    airdropBias: "skyfire",
    objective: "突破舰队防空网并瘫痪航母甲板",
    bossId: "tsunami-wing",
  },
  arctic: {
    id: "arctic",
    name: "北极光走廊",
    code: "ARCTIC CORRIDOR",
    description: "冰墙和移动冰块改变航线，极光事件会冻结敌弹。",
    feature: "冰墙 · 移动冰块 · 极光冻结",
    background: "#e8f1ee",
    grid: "rgba(44, 102, 91, 0.12)",
    accent: "#4d927f",
    structureSpeed: 54,
    event: "aurora",
    airdropBias: "defense",
    objective: "在暴雪中恢复极地通讯链路",
    bossId: "white-night-ghost",
  },
  "sky-corridor": {
    id: "sky-corridor",
    name: "天穹回廊",
    code: "CELESTIAL ARCADE",
    description: "能源门、反射墙和薄墙组成可自由选路的云端基地。",
    feature: "能源门 · 激光折射 · 可破坏航路",
    background: "#dce7eb",
    grid: "rgba(31, 74, 91, 0.1)",
    accent: "#247f9c",
    structureSpeed: 64,
    event: "phase",
    airdropBias: "transform",
    objective: "穿越云墙并切断空中都市能源核心",
    bossId: "sky-ring",
  },
  "meteor-rift": {
    id: "meteor-rift",
    name: "陨星禁区",
    code: "METEOR RIFT",
    description: "巨型陨石和碎石墙封锁航线，可诱导坠落陨石攻击敌军。",
    feature: "陨石墙 · 坠落预警 · 陨星核心",
    background: "#e9e1df",
    grid: "rgba(92, 58, 55, 0.12)",
    accent: "#a34f46",
    structureSpeed: 50,
    event: "meteor",
    airdropBias: "firepower",
    objective: "穿越碎片走廊并阻止轨道轰炸",
    bossId: "doomsday-trident",
  },
};

const MAP_BLUEPRINTS = {
  usa: [
    { x: 0, width: 0.2, y: -0.7, height: 0.36, kind: "radar-wall" },
    { x: 0.8, width: 0.2, y: -0.7, height: 0.36, kind: "radar-wall" },
    { x: 0.08, width: 0.25, y: -1.34, height: 0.18, kind: "platform" },
    { x: 0.67, width: 0.25, y: -1.34, height: 0.18, kind: "platform" },
    { x: 0.34, width: 0.32, y: -1.9, height: 0.12, kind: "gate", gateCycle: 5.2, gateOpenFor: 2.2 },
    { x: 0, width: 0.27, y: -2.48, height: 0.31, kind: "breakable", breakable: true, hp: 34 },
    { x: 0.73, width: 0.27, y: -2.48, height: 0.31, kind: "breakable", breakable: true, hp: 34 },
    { x: 0.39, width: 0.22, y: -3.08, height: 0.13, kind: "danger", solid: false, damage: 1 },
  ],
  pacific: [
    { x: 0, width: 0.28, y: -0.74, height: 0.32, kind: "wreck" },
    { x: 0.72, width: 0.28, y: -0.74, height: 0.32, kind: "wreck" },
    { x: 0.1, width: 0.2, y: -1.36, height: 0.18, kind: "cargo", vx: 13 },
    { x: 0.7, width: 0.2, y: -1.36, height: 0.18, kind: "cargo", vx: -13 },
    { x: 0.38, width: 0.24, y: -1.95, height: 0.14, kind: "storm-core", solid: false, damage: 1 },
    { x: 0, width: 0.24, y: -2.55, height: 0.28, kind: "breakable", breakable: true, hp: 28 },
    { x: 0.76, width: 0.24, y: -2.55, height: 0.28, kind: "breakable", breakable: true, hp: 28 },
    { x: 0.32, width: 0.36, y: -3.15, height: 0.11, kind: "gate", gateCycle: 4.8, gateOpenFor: 2.4 },
  ],
  arctic: [
    { x: 0, width: 0.24, y: -0.72, height: 0.4, kind: "ice-wall", breakable: true, hp: 38 },
    { x: 0.76, width: 0.24, y: -0.72, height: 0.4, kind: "ice-wall", breakable: true, hp: 38 },
    { x: 0.15, width: 0.19, y: -1.38, height: 0.2, kind: "ice-block", vx: 18, breakable: true, hp: 24 },
    { x: 0.66, width: 0.19, y: -1.38, height: 0.2, kind: "ice-block", vx: -18, breakable: true, hp: 24 },
    { x: 0.37, width: 0.26, y: -2.02, height: 0.13, kind: "aurora-field", solid: false, damage: 0 },
    { x: 0, width: 0.29, y: -2.62, height: 0.24, kind: "ice-wall", breakable: true, hp: 32 },
    { x: 0.71, width: 0.29, y: -2.62, height: 0.24, kind: "ice-wall", breakable: true, hp: 32 },
    { x: 0.39, width: 0.22, y: -3.2, height: 0.12, kind: "gate", gateCycle: 5.8, gateOpenFor: 2.8 },
  ],
  "sky-corridor": [
    { x: 0, width: 0.2, y: -0.72, height: 0.42, kind: "wall" },
    { x: 0.8, width: 0.2, y: -0.72, height: 0.42, kind: "wall" },
    { x: 0, width: 0.34, y: -1.36, height: 0.22, kind: "platform" },
    { x: 0.66, width: 0.34, y: -1.36, height: 0.22, kind: "platform" },
    { x: 0.27, width: 0.46, y: -1.96, height: 0.13, kind: "reflector", reflective: true },
    { x: 0, width: 0.25, y: -2.46, height: 0.38, kind: "wall" },
    { x: 0.42, width: 0.16, y: -2.46, height: 0.38, kind: "breakable", breakable: true, hp: 28 },
    { x: 0.75, width: 0.25, y: -2.46, height: 0.38, kind: "wall" },
    { x: 0.08, width: 0.26, y: -3.15, height: 0.2, kind: "platform" },
    { x: 0.66, width: 0.26, y: -3.15, height: 0.2, kind: "platform" },
    { x: 0, width: 0.18, y: -3.72, height: 0.48, kind: "reflector", reflective: true },
    { x: 0.82, width: 0.18, y: -3.72, height: 0.48, kind: "reflector", reflective: true },
  ],
  "meteor-rift": [
    { x: 0, width: 0.25, y: -0.72, height: 0.38, kind: "meteor-rock", breakable: true, hp: 54 },
    { x: 0.75, width: 0.25, y: -0.72, height: 0.38, kind: "meteor-rock", breakable: true, hp: 54 },
    { x: 0.12, width: 0.18, y: -1.38, height: 0.2, kind: "meteor-fragment", vx: 20, breakable: true, hp: 22 },
    { x: 0.7, width: 0.18, y: -1.38, height: 0.2, kind: "meteor-fragment", vx: -20, breakable: true, hp: 22 },
    { x: 0.38, width: 0.24, y: -1.98, height: 0.15, kind: "rift", solid: false, damage: 1 },
    { x: 0, width: 0.31, y: -2.58, height: 0.26, kind: "meteor-rock", breakable: true, hp: 46 },
    { x: 0.69, width: 0.31, y: -2.58, height: 0.26, kind: "meteor-rock", breakable: true, hp: 46 },
    { x: 0.37, width: 0.26, y: -3.2, height: 0.13, kind: "breakable", breakable: true, hp: 32 },
  ],
};

export function getBattleMap(mapId) {
  return BATTLE_MAPS[mapId] || BATTLE_MAPS.usa;
}

export function createMapStructures(mapId, width, height) {
  const blueprint = MAP_BLUEPRINTS[mapId] || MAP_BLUEPRINTS.usa;
  const safeWidth = Math.max(320, Number(width) || 320);
  const safeHeight = Math.max(480, Number(height) || 480);
  return blueprint.map((item, index) => ({
    id: `${mapId}-${index}`,
    x: item.x * safeWidth,
    y: item.y * safeHeight,
    originX: item.x * safeWidth,
    width: Math.max(38, item.width * safeWidth),
    height: Math.max(34, item.height * safeHeight),
    kind: item.kind,
    solid: item.solid !== false,
    breakable: Boolean(item.breakable),
    reflective: Boolean(item.reflective),
    damage: Number(item.damage) || 0,
    gateCycle: Number(item.gateCycle) || 0,
    gateOpenFor: Number(item.gateOpenFor) || 0,
    vx: Number(item.vx) || 0,
    hp: item.hp || Infinity,
    maxHp: item.hp || Infinity,
    open: false,
    destroyed: false,
  }));
}

function structureBlocks(structure) {
  return Boolean(structure && !structure.destroyed && !structure.open && structure.solid !== false);
}

export function circleIntersectsStructure(circle, structure, inset = 0) {
  if (!structureBlocks(structure)) return false;
  const shrink = Math.max(0, Number(inset) || 0);
  const left = structure.x + shrink;
  const right = structure.x + structure.width - shrink;
  const top = structure.y + shrink;
  const bottom = structure.y + structure.height - shrink;
  if (right <= left || bottom <= top) return false;
  const x = Math.max(left, Math.min(right, circle.x));
  const y = Math.max(top, Math.min(bottom, circle.y));
  const dx = circle.x - x;
  const dy = circle.y - y;
  return dx * dx + dy * dy <= (circle.radius || 0) ** 2;
}

export function pointInsideStructure(x, y, structure, padding = 0) {
  if (!structureBlocks(structure)) return false;
  return x >= structure.x - padding
    && x <= structure.x + structure.width + padding
    && y >= structure.y - padding
    && y <= structure.y + structure.height + padding;
}

export function pointInsideHazard(x, y, structure, padding = 0) {
  if (!structure || structure.destroyed || structure.solid !== false || structure.damage <= 0) return false;
  return x >= structure.x - padding
    && x <= structure.x + structure.width + padding
    && y >= structure.y - padding
    && y <= structure.y + structure.height + padding;
}

export function resolveCircleFromStructure(circle, structure) {
  if (!circleIntersectsStructure(circle, structure)) return { x: circle.x, y: circle.y, collided: false };
  const radius = circle.radius || 0;
  const clearance = 0.5;
  const candidates = [
    { x: structure.x - radius - clearance, y: circle.y, distance: Math.abs(circle.x - (structure.x - radius)) },
    { x: structure.x + structure.width + radius + clearance, y: circle.y, distance: Math.abs(circle.x - (structure.x + structure.width + radius)) },
    { x: circle.x, y: structure.y - radius - clearance, distance: Math.abs(circle.y - (structure.y - radius)) },
    { x: circle.x, y: structure.y + structure.height + radius + clearance, distance: Math.abs(circle.y - (structure.y + structure.height + radius)) },
  ].sort((a, b) => a.distance - b.distance);
  return { ...candidates[0], collided: true };
}
