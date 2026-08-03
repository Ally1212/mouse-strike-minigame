import { MAP_ORDER } from "../content/battle-maps.js";
import { FIGHTER_ORDER } from "../content/fighter-profiles.js";
import { MINI_MISSION_ORDER } from "../content/mini-missions.js";
import { ENEMY_ORDER } from "../core/enemy-config.js";

export function createQaController(app) {
  const requireCombat = () => {
    if (!app.combatSystem || app.state.scene !== "combat") throw new Error("QA action requires an active combat session");
    return app.combatSystem;
  };

  return {
    enabled: true,
    catalogs: {
      fighters: [...FIGHTER_ORDER],
      maps: [...MAP_ORDER],
      enemies: [...ENEMY_ORDER],
      missions: [...MINI_MISSION_ORDER],
      pickups: ["core", "evolution", "trajectory", "health", "barrier", "ally", "meteor-core"],
    },
    selectFighter(fighterId) {
      if (!FIGHTER_ORDER.includes(fighterId)) throw new Error(`Unknown fighter: ${fighterId}`);
      app.selectFighter(fighterId);
      return fighterId;
    },
    selectMap(mapId) {
      if (!MAP_ORDER.includes(mapId)) throw new Error(`Unknown map: ${mapId}`);
      app.state.mapId = mapId;
      return mapId;
    },
    setCombat(values = {}) {
      const system = requireCombat();
      const state = system.state;
      if (values.wave !== undefined) state.wave = Math.max(1, Math.trunc(values.wave));
      if (values.elapsed !== undefined) state.elapsed = Math.max(0, Number(values.elapsed) || 0);
      if (values.health !== undefined) state.player.health = Math.max(1, Math.min(state.player.maxHealth, Number(values.health) || 1));
      if (values.shield !== undefined) state.player.shieldCharges = Math.max(0, Math.trunc(values.shield));
      if (values.weaponLevel !== undefined) state.weaponLevel = Math.max(1, Math.min(5, Math.trunc(values.weaponLevel)));
      if (values.cores !== undefined) state.transformCores = Math.max(0, Math.min(3, Math.trunc(values.cores)));
      return this.snapshot();
    },
    spawnEnemy(type = "scout", x) {
      if (!ENEMY_ORDER.includes(type)) throw new Error(`Unknown enemy: ${type}`);
      return requireCombat().spawnEnemy(type, x);
    },
    spawnBoss(wave = 4) {
      return requireCombat().spawnBoss(wave);
    },
    spawnPickup(type = "core") {
      const system = requireCombat();
      return system.spawnPickup(system.state.player.x, system.state.player.y - 120, type);
    },
    spawnMeteor(large = false) {
      const system = requireCombat();
      system.spawnMeteorWarning(Boolean(large));
      const warnings = system.state.entities.meteorWarnings;
      const warning = warnings[warnings.length - 1];
      warning.life = 0;
      system.updateMeteors(0);
      const meteors = system.state.entities.meteors;
      return meteors[meteors.length - 1];
    },
    spawnAirdrop() {
      requireCombat().spawnAirdropCarrier();
      return app.state.combat.airdrop;
    },
    startMission(missionId) {
      if (!MINI_MISSION_ORDER.includes(missionId)) throw new Error(`Unknown mission: ${missionId}`);
      const system = requireCombat();
      system.state.pendingMissionId = missionId;
      system.beginMission(missionId);
      return system.state.mission;
    },
    clear(kind = "all") {
      const system = requireCombat();
      const kinds = kind === "all"
        ? ["playerProjectiles", "enemyProjectiles", "enemies", "particles", "pickups", "meteors"]
        : [kind];
      kinds.forEach((name) => {
        if (system.state.entities[name]) system.clearEntityKind(name);
      });
      if (kind === "all" || kind === "structures") system.state.mapStructures.forEach((structure) => { structure.destroyed = true; });
      return this.metrics();
    },
    simulateFps(fps = 60, seconds = 3) {
      const frameRate = fps === 30 ? 30 : 60;
      app.clock.step = 1 / frameRate;
      for (let index = 0; index < frameRate * seconds; index += 1) app.quality.sample(1 / frameRate);
      return { frameRate, tier: app.quality.tier, measured: app.quality.fps };
    },
    snapshot() {
      return {
        scene: app.state.scene,
        fighterId: app.state.fighterId,
        mapId: app.state.mapId,
        combat: app.state.combat ? {
          elapsed: app.state.combat.elapsed,
          wave: app.state.combat.wave,
          health: app.state.combat.player.health,
          maxHealth: app.state.combat.player.maxHealth,
          shield: app.state.combat.player.shieldCharges,
          weaponLevel: app.state.combat.weaponLevel,
          cores: app.state.combat.transformCores,
        } : null,
      };
    },
    metrics() {
      const system = app.combatSystem;
      return {
        drawCalls: app.renderer.renderer.info.render.calls,
        textures: app.renderer.renderer.info.memory.textures,
        geometries: app.renderer.renderer.info.memory.geometries,
        audioEvents: app.audio.lastPlayed.size,
        pools: system ? Object.fromEntries(Object.entries(system.pools).map(([name, pool]) => [name, { active: pool.size, free: pool.free.length }])) : {},
        heapBytes: globalThis.performance?.memory?.usedJSHeapSize ?? null,
      };
    },
  };
}
