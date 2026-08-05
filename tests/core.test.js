import { describe, expect, test } from "vitest";
import { GameClock } from "../src/core/clock.js";
import { createInitialState, serializeSettings } from "../src/core/game-state.js";
import { ObjectPool } from "../src/core/object-pool.js";
import { ResourceManager } from "../src/platform/resource-manager.js";

describe("mini game foundation", () => {
  test("starts with the requested default fighter and map", () => {
    const state = createInitialState();
    expect(state.scene).toBe("loading");
    expect(state.fighterId).toBe("j20");
    expect(state.mapId).toBe("usa");
    expect(state.combat.weaponLevel).toBe(3);
    expect(state.combat.transformCores).toBe(0);
  });

  test("restores local settings while ignoring obsolete X-10 unlock flags", () => {
    const state = createInitialState({
      fighterId: "rafale",
      mapId: "arctic",
      volume: 0.35,
      muted: true,
      quality: "low",
      haptics: false,
      effects: "reduced",
      reducedMotion: true,
      tutorialSeen: true,
      hangarGuideStage: 2,
      weaponModes: { rafale: 2, hypersonic: 9 },
      highScore: 4200,
      x10Unlocked: true,
    });
    expect(state).toMatchObject({
      fighterId: "rafale",
      mapId: "arctic",
      settings: { volume: 0.35, muted: true, quality: "low", haptics: false, effects: "reduced", reducedMotion: true, tutorialSeen: true },
      hangar: { guideStage: 2, weaponModeIndex: 2 },
      weaponModes: { rafale: 2, hypersonic: 9 },
      stats: { highScore: 4200 },
    });
    expect(serializeSettings(state)).not.toHaveProperty("x10Unlocked");
    expect(serializeSettings(state)).toMatchObject({ reducedMotion: true, hangarGuideStage: 2, weaponModes: { rafale: 2, hypersonic: 9 } });
  });

  test("never persists obsolete X-10 gate state", () => {
    const state = createInitialState({ fighterId: "hypersonic", x10Unlocked: true });
    expect(serializeSettings(state)).not.toHaveProperty("x10Unlocked");
    expect(serializeSettings(state)).not.toHaveProperty("conceptCode");
  });

  test("fixed clock pauses without consuming gameplay time", () => {
    const clock = new GameClock({ step: 0.01 });
    let updates = 0;
    clock.resume(1000);
    clock.advance(1050, () => updates += 1);
    expect(updates).toBe(5);
    clock.pause();
    clock.advance(5000, () => updates += 1);
    expect(updates).toBe(5);
  });

  test("fixed clock produces the same ten-second simulation at 30 and 60 FPS", () => {
    function simulate(frameRate) {
      const clock = new GameClock({ step: 1 / 60, maxDelta: 0.1 });
      let updates = 0;
      clock.resume(0);
      for (let frame = 1; frame <= frameRate * 10; frame += 1) {
        clock.advance(frame / frameRate * 1000, () => updates += 1);
      }
      return updates;
    }
    expect(simulate(30)).toBe(600);
    expect(simulate(60)).toBe(600);
  });

  test("object pools reuse released objects", () => {
    const pool = new ObjectPool(() => ({ active: false }), (item, values) => Object.assign(item, values, { active: true }), 1);
    const first = pool.acquire({ x: 1 });
    pool.release(first);
    const second = pool.acquire({ x: 2 });
    expect(second).toBe(first);
    expect(second.x).toBe(2);
  });

  test("maps fighters to functional subpackages", async () => {
    const loaded = [];
    const manager = new ResourceManager({
      loadSubpackage: async (name) => loaded.push(name),
      preloadSubpackages: async () => {},
    });
    await manager.ensure({ fighterId: "hypersonic", mapId: "meteor-rift" });
    expect(loaded).toEqual(["fighter-x10", "maps-extra"]);
    loaded.length = 0;
    await manager.ensure({ fighterId: "j20", mapId: "usa" });
    expect(loaded).toEqual([]);
  });

  test("clears failed subpackage promises so a retry can succeed", async () => {
    let attempts = 0;
    const manager = new ResourceManager({
      loadSubpackage: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("offline");
        return { ok: true };
      },
      preloadSubpackages: async () => {},
    });
    await expect(manager.load("maps-extra")).rejects.toThrow("offline");
    expect(manager.loaded.has("maps-extra")).toBe(false);
    await expect(manager.load("maps-extra")).resolves.toEqual({ ok: true });
    expect(attempts).toBe(2);
    expect(manager.loaded.has("maps-extra")).toBe(true);
  });

  test("forwards package progress and reuses an already loaded package while offline", async () => {
    const progress = [];
    let online = true;
    const manager = new ResourceManager({
      loadSubpackage: async (name, onProgress) => {
        if (!online) throw new Error("offline");
        onProgress({ progress: 36, name });
        return { name };
      },
      preloadSubpackages: async () => {},
    });
    await manager.ensure({ fighterId: "j35", mapId: "usa" }, (event) => progress.push(event));
    expect(progress).toEqual([{ progress: 36, name: "fighters-cn-us" }]);
    online = false;
    await expect(manager.ensure({ fighterId: "j35", mapId: "usa" })).resolves.toEqual(["fighters-cn-us"]);
  });

  test("reports map package readiness for the custom picker", async () => {
    let resolveLoad;
    const manager = new ResourceManager({
      loadSubpackage: () => new Promise((resolve) => { resolveLoad = resolve; }),
      preloadSubpackages: async () => {},
    });
    expect(manager.statusForMap("usa")).toBe("ready");
    expect(manager.statusForMap("pacific")).toBe("remote");
    const loading = manager.load("maps-extra");
    expect(manager.statusForMap("pacific")).toBe("loading");
    resolveLoad({ ok: true });
    await loading;
    expect(manager.statusForMap("pacific")).toBe("ready");
  });
});
