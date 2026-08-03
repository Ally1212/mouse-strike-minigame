import { describe, expect, test, vi } from "vitest";
import { createQaController } from "../src/qa/qa-controller.js";

describe("development QA controller", () => {
  test("exposes catalogs, state controls and runtime metrics", () => {
    const combat = {
      elapsed: 0,
      wave: 1,
      player: { health: 100, maxHealth: 180, shieldCharges: 0 },
      weaponLevel: 3,
      transformCores: 0,
    };
    const system = {
      state: combat,
      pools: { enemies: { size: 2, free: [{}, {}] } },
      spawnEnemy: vi.fn((type) => ({ type })),
      clearEntityKind: vi.fn(),
    };
    const app = {
      state: { scene: "combat", fighterId: "j20", mapId: "usa", combat },
      combatSystem: system,
      selectFighter: vi.fn(),
      clock: { step: 1 / 60 },
      quality: { tier: "high", fps: 60, sample: vi.fn() },
      renderer: { renderer: { info: { render: { calls: 42 }, memory: { textures: 7, geometries: 4 } } } },
      audio: { lastPlayed: new Map([["fire", 1]]) },
    };
    const qa = createQaController(app);
    expect(qa.catalogs.fighters).toHaveLength(9);
    expect(qa.catalogs.maps).toHaveLength(5);
    expect(qa.catalogs.enemies).toHaveLength(10);
    qa.setCombat({ wave: 8, elapsed: 88, health: 120, shield: 2, weaponLevel: 5, cores: 3 });
    expect(qa.snapshot().combat).toEqual({ elapsed: 88, wave: 8, health: 120, maxHealth: 180, shield: 2, weaponLevel: 5, cores: 3 });
    expect(qa.spawnEnemy("helicopter")).toEqual({ type: "helicopter" });
    expect(qa.metrics()).toMatchObject({ drawCalls: 42, textures: 7, audioEvents: 1, pools: { enemies: { active: 2, free: 2 } } });
  });
});
