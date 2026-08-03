import { describe, expect, test } from "vitest";
import { fighterAirframeSpec, fighterCombatScale, fighterSilhouetteGeometry, fighterWeaponHardpointKeys, fighterWeaponOrigins } from "../src/content/fighter-geometry.js";
import { FIGHTER_ORDER, FIGHTERS } from "../src/content/fighter-profiles.js";
import { createFighterModel } from "../src/render/fighter-model.js";

describe("shared fighter geometry", () => {
  test.each(FIGHTER_ORDER)("%s uses the same airframe specification in 3D and 2D", (fighterId) => {
    const fighter = FIGHTERS[fighterId];
    const spec = fighterAirframeSpec(fighter);
    const model = createFighterModel(fighter);
    const silhouette = fighterSilhouetteGeometry(fighter, 100, 100, 1);
    expect(model.userData.blueprint).toBe(spec);
    expect(silhouette.engines).toHaveLength(spec.engines);
    expect(silhouette.canards.length > 0).toBe(spec.canard > 0);
    expect(silhouette.tails).toHaveLength(spec.tails);
    expect(silhouette.fuselage.length).toBeGreaterThanOrEqual(8);
    expect(silhouette.wingPanels).toHaveLength(2);
    expect(silhouette.intakes).toHaveLength(2);
    expect(silhouette.weaponBays).toHaveLength(2);
    expect(silhouette.panelLines).toHaveLength(4);
  });

  test("combat rendering and weapon origins share the exact same scale", () => {
    expect(fighterCombatScale(false)).toBe(1.12);
    expect(fighterCombatScale(true)).toBe(1.34);
    const normal = fighterWeaponOrigins(FIGHTERS.j20, 180, 700, fighterCombatScale(false), "pulse", 3);
    const transformed = fighterWeaponOrigins(FIGHTERS.j20, 180, 700, fighterCombatScale(true), "pulse", 3);
    expect(Math.abs(transformed[0].x - 180)).toBeGreaterThan(Math.abs(normal[0].x - 180));
  });

  test("all nine 2D silhouettes remain structurally distinct", () => {
    const signatures = FIGHTER_ORDER.map((fighterId) => {
      const fighter = FIGHTERS[fighterId];
      const geometry = fighterSilhouetteGeometry(fighter, 0, 0, 1);
      const span = Math.max(...geometry.outline.map((point) => Math.abs(point.x)));
      return [geometry.profile, span.toFixed(2), geometry.canards.length, geometry.tails.length, geometry.engines.length].join("|");
    });
    expect(new Set(signatures).size).toBe(FIGHTER_ORDER.length);
  });

  test("preview and combat can reuse identical points at different scales", () => {
    const fighter = FIGHTERS.j20;
    const preview = fighterSilhouetteGeometry(fighter, 180, 360, 0.8);
    const combat = fighterSilhouetteGeometry(fighter, 180, 700, 1);
    expect(preview.outline).toHaveLength(combat.outline.length);
    preview.outline.forEach((point, index) => {
      const previewX = (point.x - 180) / 0.8;
      const combatX = combat.outline[index].x - 180;
      expect(previewX).toBeCloseTo(combatX, 5);
    });
  });

  test.each(["pulse", "wave", "rail", "heavy", "seeker", "drone", "laser"])("%s uses real aircraft hardpoints", (pattern) => {
    const fighter = FIGHTERS.j20;
    const geometry = fighterSilhouetteGeometry(fighter, 180, 700, 1);
    const keys = fighterWeaponHardpointKeys(pattern, 3);
    const origins = fighterWeaponOrigins(fighter, 180, 700, 1, pattern, keys.length);
    expect(origins.map((origin) => origin.key)).toEqual(keys);
    origins.forEach((origin) => expect(origin).toMatchObject(geometry.hardpoints[origin.key]));
  });

  test("one, two and three-shot weapons keep their hardpoints centered and mirrored", () => {
    expect(fighterWeaponHardpointKeys("laser", 1)).toEqual(["nose"]);
    expect(fighterWeaponHardpointKeys("laser", 2)).toEqual(["leftWing", "rightWing"]);
    expect(fighterWeaponHardpointKeys("seeker", 3)).toEqual(["leftBay", "nose", "rightBay"]);
    expect(fighterWeaponHardpointKeys("heavy", 2)).toEqual(["leftBay", "rightBay"]);
    const pair = fighterWeaponOrigins(FIGHTERS.su57, 180, 700, 1, "heavy", 2);
    expect(pair[0].x - 180).toBeCloseTo(-(pair[1].x - 180), 5);
    expect(pair[0].y).toBeCloseTo(pair[1].y, 5);
  });
});
