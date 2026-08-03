import { describe, expect, test } from "vitest";
import { FIGHTER_ORDER, FIGHTERS, WINGMAN_SPECS, getToolModes } from "../src/content/fighter-profiles.js";
import { BATTLE_MAPS, MAP_ORDER, createMapStructures } from "../src/content/battle-maps.js";
import { MINI_MISSION_ORDER, coasterMotion } from "../src/content/mini-missions.js";
import { TRANSFORM_CORE_COST, TRANSFORM_DURATION, canEnterCoreTransform } from "../src/content/gameplay-rules.js";

describe("migrated content contract", () => {
  test("contains nine distinct fighters in the approved order", () => {
    expect(FIGHTER_ORDER).toEqual(["j20", "j35", "faxx", "f22", "typhoon", "rafale", "gripen", "su57", "hypersonic"]);
    const fighters = FIGHTER_ORDER.map((id) => FIGHTERS[id]);
    expect(new Set(fighters.map((fighter) => fighter.health)).size).toBe(9);
    expect(new Set(fighters.map((fighter) => fighter.rig.profile)).size).toBe(9);
    expect(new Set(fighters.map((fighter) => fighter.passiveId)).size).toBe(9);
    expect(new Set(fighters.map((fighter) => fighter.tactical.id)).size).toBe(9);
    expect(new Set(fighters.map((fighter) => fighter.rig.assaultForm)).size).toBe(9);
    expect(new Set(FIGHTER_ORDER.map((id) => JSON.stringify(WINGMAN_SPECS[id]))).size).toBe(9);
  });

  test("retains three normal forms and ten X-10 forms", () => {
    FIGHTER_ORDER.forEach((id) => expect(getToolModes(id)).toHaveLength(id === "hypersonic" ? 10 : 3));
    expect(getToolModes("hypersonic").filter((mode) => mode.pattern === "laser")).toHaveLength(4);
  });

  test("retains manual three-core ten-second transformation", () => {
    expect(TRANSFORM_CORE_COST).toBe(3);
    expect(TRANSFORM_DURATION).toBe(10);
    expect(canEnterCoreTransform(2)).toBe(false);
    expect(canEnterCoreTransform(3)).toBe(true);
  });

  test("retains five maps with solid structures", () => {
    expect(MAP_ORDER).toHaveLength(5);
    MAP_ORDER.forEach((id) => {
      expect(createMapStructures(id, 375, 812).length).toBeGreaterThanOrEqual(8);
      expect(BATTLE_MAPS[id].description.length).toBeGreaterThan(12);
      expect(BATTLE_MAPS[id].feature.split("·").length).toBeGreaterThanOrEqual(3);
    });
  });

  test("retains five mini missions and coaster phases", () => {
    expect(MINI_MISSION_ORDER).toEqual(["coaster", "rings", "carrier", "mothership", "chain"]);
    expect([0.05, 0.25, 0.5, 0.72, 0.95].map((value) => coasterMotion(value).segmentLabel)).toEqual([
      "弹射起步", "垂直急降", "高速 S 弯", "螺旋翻转", "终点冲刺",
    ]);
  });
});
