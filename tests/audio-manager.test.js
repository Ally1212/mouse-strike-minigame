import { describe, expect, test, vi } from "vitest";
import { AudioManager } from "../src/audio/audio-manager.js";

function createAudioRuntime(isWx = false) {
  const oscillators = [];
  const master = { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() };
  const context = {
    state: "running",
    currentTime: 0,
    destination: {},
    resume: vi.fn(async () => {}),
    suspend: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    createGain: vi.fn(() => {
      if (!context.masterCreated) {
        context.masterCreated = true;
        return master;
      }
      return {
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
    }),
    createOscillator: vi.fn(() => {
      const oscillator = {
        frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
      };
      oscillators.push(oscillator);
      return oscillator;
    }),
  };
  const track = { play: vi.fn(), pause: vi.fn(), stop: vi.fn(), destroy: vi.fn(), loop: false, volume: 0 };
  return {
    runtime: {
      isWx,
      createWebAudioContext: () => context,
      createAudioTrack: vi.fn(() => track),
    },
    context,
    track,
    master,
    oscillators,
  };
}

describe("audio lifecycle", () => {
  test("unlocks one music track, throttles rapid effects and releases nodes", async () => {
    const fixture = createAudioRuntime();
    const manager = new AudioManager(fixture.runtime, { muted: false, volume: 0.8 });
    await manager.unlock();
    await manager.unlock();
    expect(fixture.track.play).toHaveBeenCalledTimes(1);

    expect(manager.play("fire")).toBe(true);
    expect(manager.play("fire")).toBe(false);
    fixture.context.currentTime = 0.1;
    expect(manager.play("fire")).toBe(true);
    expect(fixture.oscillators).toHaveLength(2);
    fixture.context.currentTime = 0.2;
    expect(manager.play("uiConfirm")).toBe(true);
    expect(fixture.oscillators).toHaveLength(5);
    fixture.oscillators.forEach((oscillator) => oscillator.onended());
    expect(fixture.oscillators.every((oscillator) => oscillator.disconnect.mock.calls.length === 1)).toBe(true);

    for (let index = 0; index < 20; index += 1) {
      manager.pause();
      manager.resume();
    }
    expect(fixture.runtime.createAudioTrack).toHaveBeenCalledTimes(1);

    manager.dispose();
    expect(fixture.track.stop).toHaveBeenCalledTimes(1);
    expect(fixture.track.destroy).toHaveBeenCalledTimes(1);
    expect(fixture.master.disconnect).toHaveBeenCalledTimes(1);
    expect(fixture.context.close).toHaveBeenCalledTimes(1);
  });

  test("starts WeChat music only after the optional audio package is ready", async () => {
    const fixture = createAudioRuntime(true);
    const manager = new AudioManager(fixture.runtime, { muted: false, volume: 0.7 });
    await manager.unlock();
    expect(fixture.runtime.createAudioTrack).not.toHaveBeenCalled();
    expect(fixture.track.play).not.toHaveBeenCalled();

    manager.prepareMusic();
    expect(fixture.runtime.createAudioTrack).toHaveBeenCalledTimes(1);
    expect(fixture.track.play).toHaveBeenCalledTimes(1);
    manager.interruptionBegin();
    expect(fixture.track.pause).toHaveBeenCalledTimes(1);
    manager.interruptionEnd();
    manager.resume();
    expect(fixture.track.play).toHaveBeenCalledTimes(2);
    expect(fixture.runtime.createAudioTrack).toHaveBeenCalledTimes(1);
  });
});
