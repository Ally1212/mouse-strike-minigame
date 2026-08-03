import { describe, expect, test } from "vitest";
import { FIGHTER_ORDER, FIGHTERS } from "../src/content/fighter-profiles.js";
import { createFighterModel, updateFighterModel } from "../src/render/fighter-model.js";

describe("procedural flying robot transformation forms", () => {
  test.each(FIGHTER_ORDER)("%s includes an integrated head, chest and two flight-swept arms", (fighterId) => {
    const model = createFighterModel(FIGHTERS[fighterId]);
    expect(model.userData.parts.aerial.some((part) => part.userData.aerialKind === "chest")).toBe(true);
    expect(model.userData.parts.aerial.some((part) => part.userData.aerialKind === "head")).toBe(true);
    expect(model.userData.parts.aerial.filter((part) => part.userData.aerialKind === "arm")).toHaveLength(2);
    expect(model.userData.mechForm.archetype).toBeTruthy();
    expect(model.children.some((part) => part.name.startsWith("flight-mech-head-"))).toBe(true);
    expect(model.children.some((part) => part.name.includes("left-arm"))).toBe(true);
    expect(model.children.some((part) => part.name.includes("right-arm"))).toBe(true);
  });

  test.each(FIGHTER_ORDER)("%s snaps safely between flight and flying-robot form in reduced-motion mode", (fighterId) => {
    const model = createFighterModel(FIGHTERS[fighterId]);
    updateFighterModel(model, "transform", 1, 0, true);
    const aerialParts = model.userData.parts.aerial;
    expect(model.userData.transformPhase.lockPhase).toBe(1);
    expect(aerialParts.every((part) => part.scale.x > 0.9 && part.scale.y > 0.9 && part.scale.z > 0.9)).toBe(true);

    updateFighterModel(model, "flight", 2, 0, true);
    expect(model.userData.transformPhase.lockPhase).toBe(0);
    expect(aerialParts.every((part) => part.scale.x <= 0.001 && part.scale.y <= 0.001 && part.scale.z <= 0.001)).toBe(true);
  });

  test("all transformed fighters retain a horizontal flight presentation", () => {
    for (const fighterId of FIGHTER_ORDER) {
      const model = createFighterModel(FIGHTERS[fighterId]);
      updateFighterModel(model, "transform", 1, 0, true);
      expect(model.rotation.x).toBeGreaterThanOrEqual(0.3);
      expect(model.rotation.x).toBeLessThanOrEqual(0.6);
    }
  });

  test.each(FIGHTER_ORDER)("%s keeps firepower and tactical previews in aircraft posture", (fighterId) => {
    const model = createFighterModel(FIGHTERS[fighterId]);
    updateFighterModel(model, "assault", 1, 0, true);
    expect(model.userData.previewProgress).toBe(0);
    expect(model.userData.transformPhase.lockPhase).toBe(0);
    updateFighterModel(model, "tactical", 2, 0, true);
    expect(model.userData.previewProgress).toBe(0);
    updateFighterModel(model, "transform", 3, 0, true);
    expect(model.userData.previewProgress).toBe(1);
  });

  test.each(FIGHTER_ORDER)("%s exposes connected weapon hardpoints for the preview range", (fighterId) => {
    const model = createFighterModel(FIGHTERS[fighterId]);
    expect(Object.keys(model.userData.hardpoints).sort()).toEqual([
      "center", "droneLeft", "droneRight", "leftBay", "leftWing", "nose", "rightBay", "rightWing",
    ]);
    Object.values(model.userData.hardpoints).forEach((point) => expect(point.parent).toBe(model));
  });

  test("all nine fighters resolve to distinct aerial silhouettes", () => {
    const signatures = FIGHTER_ORDER.map((fighterId) => {
      const model = createFighterModel(FIGHTERS[fighterId]);
      updateFighterModel(model, "transform", 1, 0, true);
      const wing = model.userData.parts.wings[0];
      const engine = model.userData.parts.enginePods[0];
      return [
        wing.rotation.z,
        wing.rotation.y,
        wing.position.x,
        wing.position.y,
        engine.position.x,
        engine.position.y,
        model.rotation.x,
        model.userData.mechForm.archetype,
      ].map((value) => typeof value === "number" ? value.toFixed(3) : value).join("|");
    });
    expect(new Set(signatures).size).toBe(FIGHTER_ORDER.length);
  });

  test("all nine flying robots use distinct chest cores and archetypes", () => {
    const forms = FIGHTER_ORDER.map((fighterId) => createFighterModel(FIGHTERS[fighterId]).userData.mechForm);
    expect(new Set(forms.map((form) => form.archetype)).size).toBe(FIGHTER_ORDER.length);
    expect(new Set(forms.map((form) => form.coreStyle)).size).toBe(FIGHTER_ORDER.length);
    expect(new Set(forms.map((form) => form.silhouette)).size).toBe(FIGHTER_ORDER.length);
    expect(new Set(forms.map((form) => form.transformStyle)).size).toBe(FIGHTER_ORDER.length);
  });

  test("X-10 resolves to a clean connected trident without halos or floating crown parts", () => {
    const model = createFighterModel(FIGHTERS.hypersonic);
    updateFighterModel(model, "transform", 1, 0, true);
    expect(model.userData.mechForm).toMatchObject({
      archetype: "trident-seraph",
      silhouette: "three-pronged-spear",
      transformStyle: "trident-converge",
      coreStyle: "white-diamond",
    });
    expect(model.getObjectByName("hyper-crown")).toBeUndefined();
    expect(model.getObjectByName("crown-ring")).toBeUndefined();
    expect(model.getObjectByName("flight-mech-halo-core")).toBeUndefined();
    expect(model.userData.parts.enginePods.map((pod) => Math.abs(pod.position.x))).toEqual([8, 0, 8]);
  });

  test.each(FIGHTER_ORDER)("%s keeps transformed engines connected to the central flight mass", (fighterId) => {
    const model = createFighterModel(FIGHTERS[fighterId]);
    updateFighterModel(model, "transform", 1, 0, true);
    expect(Math.max(...model.userData.parts.enginePods.map((pod) => Math.abs(pod.position.x)))).toBeLessThanOrEqual(16);
    expect(Math.max(...model.userData.parts.enginePods.map((pod) => Math.abs(pod.position.y)))).toBeLessThan(14);
  });

  test("simplified flying robots avoid decorative attachment groups", () => {
    const model = createFighterModel(FIGHTERS.j20);
    updateFighterModel(model, "transform", 1, 0, true, true);
    expect(model.userData.parts.aerialDetails).toHaveLength(0);
    expect(model.getObjectByName("engine-band-1")).toBeTruthy();
    expect(model.children.some((part) => part.name.startsWith("flight-mech-details-"))).toBe(false);
  });
});
