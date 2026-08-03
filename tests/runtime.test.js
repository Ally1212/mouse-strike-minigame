import { afterEach, describe, expect, test, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("WeChat runtime adapter", () => {
  test("degrades optional capabilities while keeping lifecycle, storage and subpackage loading usable", async () => {
    const callbacks = {};
    const storage = new Map();
    const progress = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      requestAnimationFrame: vi.fn(() => 1),
      cancelAnimationFrame: vi.fn(),
    };
    const wx = {
      getWindowInfo: () => ({
        windowWidth: 375,
        windowHeight: 812,
        pixelRatio: 3,
        safeArea: { left: 0, top: 44, right: 375, bottom: 778 },
        platform: "ios",
        benchmarkLevel: 18,
      }),
      getMenuButtonBoundingClientRect: () => ({ left: 278, top: 48, right: 365, bottom: 80, width: 87, height: 32 }),
      createCanvas: () => canvas,
      onShow: (listener) => { callbacks.show = listener; },
      onHide: (listener) => { callbacks.hide = listener; },
      onWindowResize: (listener) => { callbacks.resize = listener; },
      onMemoryWarning: (listener) => { callbacks.memory = listener; },
      offMemoryWarning: vi.fn(),
      onAudioInterruptionBegin: (listener) => { callbacks.audioBegin = listener; },
      onAudioInterruptionEnd: (listener) => { callbacks.audioEnd = listener; },
      offAudioInterruptionBegin: vi.fn(),
      offAudioInterruptionEnd: vi.fn(),
      getStorageSync: (key) => storage.get(key) ?? "",
      setStorageSync: (key, value) => storage.set(key, value),
      loadSubpackage: ({ success }) => {
        queueMicrotask(() => success({ loaded: true }));
        return { onProgressUpdate: (listener) => listener({ progress: 42 }) };
      },
      vibrateShort: vi.fn(),
      createInnerAudioContext: () => ({ play: vi.fn(), pause: vi.fn(), destroy: vi.fn() }),
    };
    vi.stubGlobal("wx", wx);
    vi.stubGlobal("GameGlobal", {});

    const { createRuntime } = await import("../src/platform/runtime.js");
    const runtime = createRuntime();
    expect(runtime.isWx).toBe(true);
    expect(runtime.viewport).toMatchObject({
      width: 375,
      height: 812,
      pixelRatio: 2,
      platform: "ios",
      menuButton: { left: 278, top: 48, right: 365, bottom: 80, width: 87, height: 32 },
    });
    expect(runtime.createWebAudioContext()).toBeNull();
    await expect(runtime.preloadSubpackages(["maps-extra"])).resolves.toEqual({ skipped: true });
    await expect(runtime.loadSubpackage("maps-extra", progress)).resolves.toEqual({ loaded: true });
    expect(progress).toHaveBeenCalledWith({ progress: 42 });

    expect(runtime.setStorage("settings", { quality: "low" })).toBe(true);
    expect(runtime.getStorage("settings")).toEqual({ quality: "low" });
    runtime.vibrate("heavy");
    expect(wx.vibrateShort).toHaveBeenCalledWith({ type: "heavy" });

    const hide = vi.fn();
    const show = vi.fn();
    runtime.on("hide", hide);
    runtime.on("show", show);
    callbacks.hide({});
    callbacks.show({});
    expect(hide).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledTimes(1);
  });
});
