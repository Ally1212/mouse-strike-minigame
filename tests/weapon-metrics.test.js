import { describe, expect, test } from "vitest";
import { FIGHTER_ORDER, FIGHTERS } from "../src/content/fighter-profiles.js";
import { fighterWeaponMetrics, weaponMetrics } from "../src/content/weapon-metrics.js";

describe("weapon metrics", () => {
  test("covers every configured weapon with finite player-facing values", () => {
    for (const fighterId of FIGHTER_ORDER) {
      const rows = fighterWeaponMetrics(fighterId);
      expect(rows).toHaveLength(FIGHTERS[fighterId].toolModes.length);
      rows.forEach((row) => {
        expect(row.dps).toBeGreaterThan(0);
        expect(row.interval).toBeGreaterThanOrEqual(0.035);
        expect(["A", "B", "S"]).toContain(row.burstGrade);
        expect(["A", "B", "S"]).toContain(row.coverageGrade);
        expect(["简单", "进阶", "专家"]).toContain(row.handling);
      });
    }
  });

  test("uses the same level-three projectile and laser formulas as combat", () => {
    const projectile = weaponMetrics("j20", 0);
    expect(projectile.damagePerProjectile).toBeCloseTo(1.42 * 1.18 * 1.24, 2);
    expect(projectile.projectileCount).toBe(4);
    expect(projectile.volleyDamage).toBeCloseTo(projectile.damagePerProjectile * 4, 1);

    const laser = weaponMetrics("j20", 1);
    expect(laser.damagePerSecondPerBeam).toBeCloseTo(9.4 * 1.18, 2);
    expect(laser.duration).toBeCloseTo(0.82 * 1.2, 2);
    expect(laser.burstDamage).toBeCloseTo(laser.dps * laser.duration, 1);
  });

  test("keeps three modes on standard fighters and ten on X-10", () => {
    FIGHTER_ORDER.filter((id) => id !== "hypersonic").forEach((id) => expect(FIGHTERS[id].toolModes).toHaveLength(3));
    expect(FIGHTERS.hypersonic.toolModes).toHaveLength(10);
  });
});
