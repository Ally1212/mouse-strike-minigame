import { describe, expect, test } from "vitest";
import { FIGHTER_ORDER, FIGHTERS } from "../src/content/fighter-profiles.js";
import { fighterAbility, fighterUpgradeChoices } from "../src/content/fighter-abilities.js";
import { CombatSystem } from "../src/core/combat-system.js";
import { createCombatState } from "../src/core/game-state.js";

function createSystem(fighterId) {
  const combat = createCombatState(FIGHTERS[fighterId]);
  const events = [];
  const system = new CombatSystem({ combat, fighterId, mapId: "usa", width: 375, height: 812, emit: (event) => events.push(event) });
  return { system, combat, events };
}

describe("fighter identities and progression", () => {
  test("all nine fighters have unique combat styles, three passive phases and three upgrades", () => {
    const abilities = FIGHTER_ORDER.map(fighterAbility);
    expect(new Set(abilities.map((ability) => ability.style))).toHaveLength(9);
    abilities.forEach((ability) => {
      expect(ability.passive.phases).toHaveLength(3);
      expect(ability.passive.interval).toBeGreaterThanOrEqual(5);
      expect(ability.upgrades).toHaveLength(3);
      expect(new Set(ability.upgrades.map((item) => item.id)).size).toBe(3);
    });
  });

  test("passives automatically start their fighter-specific effect", () => {
    for (const fighterId of FIGHTER_ORDER) {
      const { system, combat } = createSystem(fighterId);
      combat.passiveTimer = 0;
      expect(system.updatePassive(0)).toBe(true);
      expect(combat.passiveEffect.style).toBe(fighterAbility(fighterId).style);
      expect(combat.passiveTimer).toBe(fighterAbility(fighterId).passive.interval);
    }
  });

  test("evolution pickups offer three fighter-specific choices and apply one safely", () => {
    const { system, combat, events } = createSystem("j20");
    system.collectPickup("evolution");
    const event = events.find((item) => item.type === "upgradeChoice");
    expect(event.choices).toEqual(fighterUpgradeChoices("j20", []));
    expect(combat.pendingUpgrade).toBe(true);
    expect(system.chooseUpgrade(event.choices[0].id)).toBe(true);
    expect(combat.upgrades).toContain(event.choices[0].id);
    expect(combat.pendingUpgrade).toBe(false);
  });

  test("wingmen automatically deploy after arrival without a dedicated action button", () => {
    const { system, combat } = createSystem("faxx");
    combat.elapsed = 8;
    combat.autoWingmanTimer = 0;
    system.updateAutoWingman(0);
    expect(combat.entities.allies.length).toBeGreaterThan(0);
    expect(combat.wingmanCooldown).toBeGreaterThan(0);
  });
});
