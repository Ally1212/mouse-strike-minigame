import { describe, expect, test, vi } from "vitest";
import { DynamicQualityManager } from "../src/core/quality-manager.js";

describe("dynamic quality", () => {
  test("drops after three seconds below 28 FPS without resetting gameplay", () => {
    const changed = vi.fn();
    const manager = new DynamicQualityManager("high", changed);
    for (let index = 0; index < 100; index += 1) manager.sample(1 / 25);
    expect(manager.tier).toBe("medium");
    expect(changed).toHaveBeenCalledWith("medium", "持续低于 28 FPS");
  });

  test("rises at most one tier after ten seconds above 55 FPS", () => {
    const manager = new DynamicQualityManager("low");
    for (let index = 0; index < 620; index += 1) manager.sample(1 / 60);
    expect(manager.tier).toBe("medium");
  });
});
