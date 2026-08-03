import { describe, expect, test } from "vitest";
import { computeCombatLayout, computeHangarLayout } from "../src/ui/layout.js";

function expectTouchable(rect) {
  expect(rect.width).toBeGreaterThanOrEqual(44);
  expect(rect.height).toBeGreaterThanOrEqual(44);
}

describe("touch layout", () => {
  test("keeps all actionable controls at least 44 logical pixels", () => {
    const safeArea = { left: 0, top: 32, right: 375, bottom: 778 };
    const hangar = computeHangarLayout(375, 812, safeArea);
    [hangar.sound, hangar.map, hangar.start, hangar.fighterPrev, hangar.fighterNext, hangar.fighterProgress, ...hangar.previewButtons, ...hangar.weaponCards, ...hangar.fighterCards].forEach(expectTouchable);
    expect(hangar.weaponCards).toHaveLength(3);
    expect(hangar.fighterCards).toHaveLength(3);
    expect(hangar.fighterCards[0].x).toBeGreaterThanOrEqual(hangar.pad);
    expect(hangar.fighterCards[2].x + hangar.fighterCards[2].width).toBeLessThanOrEqual(375 - hangar.pad);
    expect(hangar.fighterCards[1].offset).toBe(0);

    const menuButton = { left: 278, top: 48, right: 365, bottom: 80, width: 87, height: 32 };
    const combat = computeCombatLayout(375, 812, safeArea, menuButton);
    [combat.pause, ...Object.values(combat.actions)].forEach(expectTouchable);
    expect(combat.pause.y).toBeGreaterThan(menuButton.bottom);
    expect(combat.hud.y).toBeGreaterThan(menuButton.bottom);
    Object.values(combat.actions).forEach((rect) => {
      expect(rect.y + rect.height).toBeLessThanOrEqual(safeArea.bottom);
    });
  });
});
