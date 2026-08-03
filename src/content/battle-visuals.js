export const BATTLE_VISUALS = {
  usa: {
    sky: "#102f42", deep: "#061923", horizon: "#315f70", haze: "#79a9b7", streak: "#b6d7df",
    terrain: "desert-base", landmarks: ["runway", "radar", "hangar"], density: 6,
  },
  pacific: {
    sky: "#123d4a", deep: "#04242d", horizon: "#287382", haze: "#72bac1", streak: "#b9e3e5",
    terrain: "ocean", landmarks: ["island", "carrier", "buoy"], density: 7,
  },
  arctic: {
    sky: "#17444f", deep: "#071f28", horizon: "#418f91", haze: "#92d7d0", streak: "#d0f3ed",
    terrain: "icefield", landmarks: ["glacier", "ice-crack", "station"], density: 6,
  },
  "sky-corridor": {
    sky: "#173958", deep: "#071a2d", horizon: "#356f9b", haze: "#83b9df", streak: "#c4e7ff",
    terrain: "cloud-city", landmarks: ["cloud-bank", "sky-platform", "beacon"], density: 6,
  },
  "meteor-rift": {
    sky: "#3a2638", deep: "#17121f", horizon: "#754656", haze: "#bc796d", streak: "#ffd09c",
    terrain: "rift", landmarks: ["cliff", "lava-crack", "meteor"], density: 8,
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
