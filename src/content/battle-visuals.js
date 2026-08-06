export const BATTLE_VISUALS = {
  usa: {
    sky: "#102f42", deep: "#061923", horizon: "#315f70", haze: "#79a9b7", streak: "#b6d7df",
    terrain: "desert-base", landmarks: ["runway", "radar", "hangar"], density: 8,
    time: "sunset", weather: "sandstorm", landmark: "地下空军基地", mechanic: "摧毁雷达降低追踪火力",
    far: "#243e43", mid: "#36545a", near: "#182e34", warning: "#efb45b",
  },
  pacific: {
    sky: "#123d4a", deep: "#04242d", horizon: "#287382", haze: "#72bac1", streak: "#b9e3e5",
    terrain: "ocean", landmarks: ["island", "carrier", "destroyer"], density: 9,
    time: "storm", weather: "thunder", landmark: "航母战斗群", mechanic: "雷暴短暂清除敌弹",
    far: "#10343d", mid: "#164f59", near: "#082b34", warning: "#ffd45d",
  },
  arctic: {
    sky: "#17444f", deep: "#071f28", horizon: "#418f91", haze: "#92d7d0", streak: "#d0f3ed",
    terrain: "icefield", landmarks: ["glacier", "ice-crack", "station"], density: 8,
    time: "polar-night", weather: "blizzard", landmark: "极地通讯站", mechanic: "极光脉冲冻结敌弹",
    far: "#1d4c58", mid: "#2d6970", near: "#123842", warning: "#80f0d5",
  },
  "sky-corridor": {
    sky: "#173958", deep: "#071a2d", horizon: "#356f9b", haze: "#83b9df", streak: "#c4e7ff",
    terrain: "cloud-city", landmarks: ["cloud-bank", "sky-platform", "beacon"], density: 8,
    time: "high-altitude", weather: "cloud-wall", landmark: "悬浮能源都市", mechanic: "云层降低双方锁定能力",
    far: "#193c5d", mid: "#255578", near: "#0d2943", warning: "#78d8ff",
  },
  "meteor-rift": {
    sky: "#3a2638", deep: "#17121f", horizon: "#754656", haze: "#bc796d", streak: "#ffd09c",
    terrain: "rift", landmarks: ["cliff", "station-wreck", "meteor"], density: 10,
    time: "near-space", weather: "meteor-shower", landmark: "轨道站残骸", mechanic: "陨石可阻挡并引爆敌弹",
    far: "#2a1e31", mid: "#4c2b43", near: "#1a1424", warning: "#ff9b68",
  },
};

export function battleVisual(mapId) {
  return BATTLE_VISUALS[mapId] || BATTLE_VISUALS.usa;
}

export function environmentDensity(mapId, quality = "high") {
  const base = battleVisual(mapId).density;
  if (quality === "low") return Math.max(3, Math.ceil(base * 0.5));
  if (quality === "medium") return Math.max(4, Math.ceil(base * 0.75));
  return base;
}
