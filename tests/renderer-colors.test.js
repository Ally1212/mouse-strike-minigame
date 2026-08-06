import { describe, expect, test } from "vitest";
import {
  colorLuminance,
  COMPAT_LIGHT_SCALE,
  configureRendererColorPipeline,
  fighterPaintPalette,
} from "../src/render/renderer.js";

describe("fighter paint palette", () => {
  test("keeps the WeChat renderer on a non-clipping color pipeline", () => {
    const renderer = {};
    configureRendererColorPipeline(renderer);
    expect(renderer.outputEncoding).toBe(3000);
    expect(renderer.toneMapping).toBe(0);
    expect(COMPAT_LIGHT_SCALE).toBeLessThanOrEqual(0.2);
  });

  test("does not wash a light gray airframe toward white", () => {
    const paint = fighterPaintPalette("#7a8c98", false, "#ff744f");
    expect(colorLuminance(paint.upper)).toBeLessThan(0.36);
    expect(paint.panel).not.toBe("#d7edf3");
  });

  test("keeps transformed paint visibly accented", () => {
    const paint = fighterPaintPalette("#7a8c98", true, "#ff744f");
    expect(paint.body).toBe("#ff744f");
    expect(paint.upper).not.toBe(paint.body);
  });
});
