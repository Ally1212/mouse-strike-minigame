import { describe, expect, test } from "vitest";
import { FIGHTERS } from "../src/content/fighter-profiles.js";
import { weaponPreviewFrame, weaponPreviewSpec } from "../src/render/weapon-preview.js";

const bounds = { x: 16, y: 150, width: 343, height: 270 };
const origins = [{ x: 160, y: 350 }, { x: 190, y: 350 }];

describe("hangar weapon preview simulator", () => {
  test.each(["pulse", "seeker", "wave", "rail", "heavy", "drone"])("renders a distinct %s projectile presentation", (pattern) => {
    const mode = { pattern, count: 3, spread: 0.1, speed: 800 };
    const frame = weaponPreviewFrame({ mode, elapsed: weaponPreviewSpec(mode).duration * 0.55, origins, bounds });
    expect(frame.targets).toHaveLength(3);
    if (pattern === "drone") expect(frame.drones.length).toBeGreaterThan(0);
    else expect(frame.projectiles.length).toBeGreaterThan(0);
    if (pattern === "heavy") expect(frame.explosions.length).toBeGreaterThanOrEqual(0);
  });

  test("laser preview includes a real warmup followed by beams", () => {
    const mode = { pattern: "laser", count: 2, warmup: 0.3, duration: 0.7, width: 6 };
    const spec = weaponPreviewSpec(mode);
    const charging = weaponPreviewFrame({ mode, elapsed: 0.1, origins, bounds });
    const firing = weaponPreviewFrame({ mode, elapsed: spec.warmup + 0.15, origins, bounds });
    expect(charging.charge).toBeTruthy();
    expect(charging.beams).toHaveLength(0);
    expect(firing.charge).toBeNull();
    expect(firing.beams).toHaveLength(2);
    expect(firing.beams.every((beam) => beam.reflect === false)).toBe(true);
  });

  test("legacy reflection flags are normalized to straight fan beams", () => {
    const mode = { pattern: "laser", count: 2, spread: 0.13, warmup: 0.1, duration: 0.8, width: 5, reflect: true };
    const spec = weaponPreviewSpec(mode);
    const frame = weaponPreviewFrame({ mode, elapsed: spec.warmup + 0.2, origins, bounds });
    expect(spec.reflect).toBe(false);
    expect(frame.beams).toHaveLength(2);
    expect(frame.beams.every((beam) => beam.reflect === false)).toBe(true);
  });

  test("X-10 retains ten individually identifiable preview specifications", () => {
    const signatures = FIGHTERS.hypersonic.toolModes.map((mode) => {
      const spec = weaponPreviewSpec(mode);
      return [spec.pattern, spec.style, spec.projectileCount, spec.spread, spec.speed, spec.width, spec.reflect].join("|");
    });
    expect(signatures).toHaveLength(10);
    expect(new Set(signatures).size).toBe(10);
  });

  test("restarting elapsed time restarts the shot at its hardpoint", () => {
    const mode = { pattern: "pulse", count: 1, speed: 900 };
    const first = weaponPreviewFrame({ mode, elapsed: 0, origins: [origins[0]], bounds });
    const later = weaponPreviewFrame({ mode, elapsed: 0.8, origins: [origins[0]], bounds });
    expect(first.projectiles[0]).toMatchObject(origins[0]);
    expect(later.projectiles[0].y).toBeLessThan(first.projectiles[0].y);
  });

  test.each(["pulse", "wave", "rail", "heavy"])("%s preview travels on a straight launch line", (pattern) => {
    const mode = { pattern, count: 1, spread: 0, speed: 900 };
    const spec = weaponPreviewSpec(mode);
    const a = weaponPreviewFrame({ mode, elapsed: spec.duration * 0.25, origins: [origins[0]], bounds }).projectiles[0];
    const b = weaponPreviewFrame({ mode, elapsed: spec.duration * 0.55, origins: [origins[0]], bounds }).projectiles[0];
    const cross = (a.x - origins[0].x) * (b.y - origins[0].y) - (a.y - origins[0].y) * (b.x - origins[0].x);
    expect(Math.abs(cross)).toBeLessThan(0.001);
  });

  test("parallel fire stays vertical and fan fire only opens outward", () => {
    const threeOrigins = [{ x: 140, y: 350 }, { x: 175, y: 340 }, { x: 210, y: 350 }];
    const parallel = weaponPreviewFrame({ mode: { pattern: "pulse", count: 3, spread: 0 }, elapsed: 0.75, origins: threeOrigins, bounds });
    parallel.projectiles.forEach((bullet, index) => expect(bullet.x).toBeCloseTo(threeOrigins[index].x, 5));

    const fan = weaponPreviewFrame({ mode: { pattern: "pulse", count: 3, spread: 0.12 }, elapsed: 0.75, origins: threeOrigins, bounds });
    expect(fan.projectiles[0].x).toBeLessThan(threeOrigins[0].x);
    expect(fan.projectiles[1].x).toBeCloseTo(threeOrigins[1].x, 5);
    expect(fan.projectiles[2].x).toBeGreaterThan(threeOrigins[2].x);
  });
});
