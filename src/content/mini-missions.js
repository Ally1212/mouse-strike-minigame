export const MINI_MISSION_ORDER = ["coaster", "rings", "carrier", "mothership", "chain"];

export const MINI_MISSIONS = {
  coaster: {
    id: "coaster",
    schedule: 12,
    title: "云端过山车",
    tag: "极速轨道",
    rule: "跟随发光轨道完成弹射、急降、S 弯和螺旋冲刺；只需左右修正，不需要额外按键。",
    objective: "累计留在轨道内 8.5 秒",
    reward: "极限火力 5 秒 + 1000 分",
    duration: 12,
  },
  rings: {
    id: "rings",
    schedule: 38,
    title: "连续穿环",
    tag: "技巧挑战",
    rule: "用鼠标控制战机穿过依次出现的 5 个能量环，漏过后会立即生成下一环。",
    objective: "穿过 5 个能量环",
    reward: "每环 300 分；全连额外获得能量球",
    duration: 16,
  },
  carrier: {
    id: "carrier",
    schedule: 68,
    title: "航母停靠",
    tag: "战场补给",
    rule: "飞入航母甲板的黄色引导区并保持 2 秒，不需要按键，也不会切换真实降落操作。",
    objective: "在甲板稳定停靠 2 秒",
    reward: "修复 35% 耐久 + 能量球 + 僚机就绪",
    duration: 15,
  },
  mothership: {
    id: "mothership",
    schedule: 100,
    title: "母舰破袭",
    tag: "巨型目标",
    rule: "移动战机对准母舰三个发光武器舱，自动火力会集中拆除部件。",
    objective: "摧毁 3 个武器舱",
    reward: "清除敌弹 + 变身能量补满 + 2400 分",
    duration: 18,
  },
  chain: {
    id: "chain",
    schedule: 132,
    title: "连锁爆破",
    tag: "解压挑战",
    rule: "击中任意红色能源罐，引爆会传递给附近目标；寻找能炸掉最多目标的起爆点。",
    objective: "制造至少 5 连爆",
    reward: "连爆越高分数越高；达标获得屏障",
    duration: 15,
  },
};

export function coasterMotion(progress) {
  const value = Math.max(0, Math.min(1, Number(progress) || 0));
  const turn = Math.sin(value * Math.PI * 3.6) * 0.2 + Math.sin(value * Math.PI * 8.2) * 0.045;
  const drop = Math.sin(Math.min(1, value * 1.65) * Math.PI) * 0.075;
  const corkscrew = value >= 0.58 && value < 0.84
    ? Math.sin(((value - 0.58) / 0.26) * Math.PI * 2) * 0.085
    : 0;
  const segment = value < 0.16
    ? { index: 0, label: "弹射起步" }
    : value < 0.38
      ? { index: 1, label: "垂直急降" }
      : value < 0.62
        ? { index: 2, label: "高速 S 弯" }
        : value < 0.84
          ? { index: 3, label: "螺旋翻转" }
          : { index: 4, label: "终点冲刺" };
  return {
    center: Math.max(0.22, Math.min(0.78, 0.5 + turn)),
    horizonCenter: Math.max(0.38, Math.min(0.62, 0.5 + turn * 0.3)),
    horizonRatio: Math.max(0.11, Math.min(0.25, 0.18 - drop + Math.sin(value * Math.PI * 2.2) * 0.025)),
    laneScale: 0.86 + Math.sin(value * Math.PI * 2.8) * 0.1,
    roll: Math.max(-0.105, Math.min(0.105, -turn * 0.34 + corkscrew)),
    speed: segment.index === 1 || segment.index === 4 ? 1.45 : segment.index === 3 ? 1.3 : 1.08,
    segmentIndex: segment.index,
    segmentLabel: segment.label,
  };
}

export function nextMiniMission(elapsed, completed = [], blocked = false) {
  if (blocked) return null;
  return MINI_MISSION_ORDER
    .map((id) => MINI_MISSIONS[id])
    .find((mission) => elapsed >= mission.schedule && !completed.includes(mission.id)) || null;
}

export function isInsideCarrierDeck(player, carrier) {
  if (!player || !carrier) return false;
  const halfWidth = carrier.deckWidth / 2;
  const halfHeight = carrier.deckHeight / 2;
  return player.x >= carrier.x - halfWidth
    && player.x <= carrier.x + halfWidth
    && player.y >= carrier.y - halfHeight
    && player.y <= carrier.y + halfHeight;
}

export function ringContainsPlayer(player, ring) {
  if (!player || !ring) return false;
  return Math.hypot(player.x - ring.x, player.y - ring.y) <= Math.max(8, ring.radius - player.radius * 0.35);
}

export function connectedChain(nodes, startId, radius = 138) {
  const active = nodes.filter((node) => !node.destroyed);
  const byId = new Map(active.map((node) => [node.id, node]));
  if (!byId.has(startId)) return [];
  const visited = new Set([startId]);
  const queue = [byId.get(startId)];
  while (queue.length) {
    const current = queue.shift();
    active.forEach((candidate) => {
      if (visited.has(candidate.id)) return;
      if (Math.hypot(candidate.x - current.x, candidate.y - current.y) > radius) return;
      visited.add(candidate.id);
      queue.push(candidate);
    });
  }
  return [...visited];
}
