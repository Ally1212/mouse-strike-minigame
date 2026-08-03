import { describe, expect, test, vi } from "vitest";
import { GameApp } from "../src/app/game-app.js";
import { FIGHTER_ORDER } from "../src/content/fighter-profiles.js";
import { computeHangarLayout } from "../src/ui/layout.js";

function createAppHarness() {
  const callbacks = {};
  const noOpSubscription = () => () => {};
  const app = Object.create(GameApp.prototype);
  app.state = {
    scene: "combat",
    paused: false,
    pauseReason: "",
    modal: null,
    toast: null,
    settings: { haptics: true },
    combat: { ended: false },
  };
  app.runtime = {
    now: () => 1234,
    onTouch: noOpSubscription,
    on: noOpSubscription,
    onKey: noOpSubscription,
    onContextMenu: noOpSubscription,
    onMemoryWarning: (listener) => { callbacks.memory = listener; return () => {}; },
    onAudioInterruption: (begin, end) => {
      callbacks.audioBegin = begin;
      callbacks.audioEnd = end;
      return () => {};
    },
  };
  app.clock = { pause: vi.fn(), resume: vi.fn() };
  app.audio = {
    pause: vi.fn(),
    resume: vi.fn(),
    interruptionBegin: vi.fn(),
    interruptionEnd: vi.fn(),
  };
  app.quality = { setTier: vi.fn() };
  app.renderer = { releaseUnused: vi.fn() };
  app.combatTouches = new Map();
  app.unsubscribers = [];
  return { app, callbacks };
}

describe("game app lifecycle", () => {
  test("freezes combat on background and resumes only after confirmation", () => {
    const { app } = createAppHarness();
    app.pause("background");
    expect(app.state).toMatchObject({ paused: true, pauseReason: "background", modal: null });
    expect(app.clock.pause).toHaveBeenCalledTimes(1);
    expect(app.audio.pause).toHaveBeenCalledTimes(1);

    app.resumeFromBackground();
    expect(app.state.modal).toMatchObject({ type: "resume" });
    expect(app.state.paused).toBe(true);
    app.resumeCombat();
    expect(app.state.paused).toBe(false);
    expect(app.clock.resume).toHaveBeenCalledWith(1234);
    expect(app.audio.resume).toHaveBeenCalledTimes(1);
  });

  test("preserves mission and airdrop decisions while backgrounded", () => {
    const { app } = createAppHarness();
    for (const reason of ["mission", "airdrop"]) {
      app.state.paused = true;
      app.state.pauseReason = reason;
      app.state.modal = { type: reason };
      app.resumeFromBackground();
      expect(app.state.modal.type).toBe(reason);
    }
  });

  test("handles system audio interruption and memory warning without resetting combat", () => {
    const { app, callbacks } = createAppHarness();
    app.bindEvents();
    callbacks.audioBegin();
    expect(app.audio.interruptionBegin).toHaveBeenCalledTimes(1);
    expect(app.state).toMatchObject({ paused: true, pauseReason: "audio-interruption" });
    callbacks.audioEnd();
    expect(app.audio.interruptionEnd).toHaveBeenCalledTimes(1);
    expect(app.state.modal).toMatchObject({ type: "resume" });

    const combatState = app.state.combat;
    callbacks.memory();
    expect(app.quality.setTier).toHaveBeenCalledWith("low", "系统内存告警");
    expect(app.renderer.releaseUnused).toHaveBeenCalledTimes(1);
    expect(app.state.combat).toBe(combatState);
  });
});

describe("hangar fighter navigation", () => {
  function createHangarHarness() {
    const app = Object.create(GameApp.prototype);
    app.state = {
      scene: "hangar",
      fighterId: FIGHTER_ORDER[0],
      mapId: "city",
      modal: null,
      uiPress: null,
      hangar: { previewMode: "flight", modelRotation: 0, dragOffset: 0 },
      settings: { haptics: false, reducedMotion: false },
    };
    app.runtime = {
      viewport: {
        width: 375,
        height: 812,
        safeArea: { left: 0, top: 32, right: 375, bottom: 778 },
        menuButton: null,
      },
      vibrate: vi.fn(),
      now: vi.fn(() => 1000),
    };
    app.renderer = { setFighter: vi.fn() };
    app.audio = { unlock: vi.fn(), play: vi.fn() };
    app.persist = vi.fn();
    app.launchSelectedFighter = vi.fn();
    app.state.hangar.guideStage = 0;
    app.state.hangar.dragVelocity = 0;
    app.state.hangar.transition = 0;
    return app;
  }

  test("swipes from the selected fighter card to the next fighter", () => {
    const app = createHangarHarness();
    const layout = computeHangarLayout(375, 812, app.runtime.viewport.safeArea);
    const selectedCard = layout.fighterCards[1];
    const startX = selectedCard.x + selectedCard.width / 2;
    const y = selectedCard.y + selectedCard.height / 2;

    app.onTouchStart({ changedTouches: [{ identifier: 1, clientX: startX, clientY: y }] });
    expect(app.hangarTouch.role).toBe("cards");
    app.onTouchMove({ touches: [{ identifier: 1, clientX: startX - 64, clientY: y }] });
    expect(app.state.hangar.dragOffset).toBe(-64);
    app.onTouchEnd({ changedTouches: [{ identifier: 1, clientX: startX - 64, clientY: y }] });

    expect(app.state.fighterId).toBe(FIGHTER_ORDER[1]);
    expect(app.state.hangar.dragOffset).toBe(0);
  });

  test("supports explicit previous and next fighter buttons", () => {
    const app = createHangarHarness();
    const layout = computeHangarLayout(375, 812, app.runtime.viewport.safeArea);
    const next = layout.fighterNext;

    app.handleHangarTouch({
      role: "fighter-next",
      moved: false,
      x: next.x + next.width / 2,
      y: next.y + next.height / 2,
      startX: next.x,
      startY: next.y,
    });

    expect(app.state.fighterId).toBe(FIGHTER_ORDER[1]);
  });

  test("jumps to a fighter through the pagination strip", () => {
    const app = createHangarHarness();
    const layout = computeHangarLayout(375, 812, app.runtime.viewport.safeArea);
    const targetIndex = 6;
    const x = layout.fighterProgress.x + layout.fighterProgress.width * ((targetIndex + 0.5) / FIGHTER_ORDER.length);

    app.handleHangarTouch({
      role: "fighter-progress",
      moved: false,
      x,
      y: layout.fighterProgress.y + 20,
      startX: x,
      startY: layout.fighterProgress.y,
    });

    expect(app.state.fighterId).toBe(FIGHTER_ORDER[targetIndex]);
  });

  test("advances and persists the progressive hangar guide", () => {
    const app = createHangarHarness();
    app.advanceHangarGuide(1);
    expect(app.state.hangar.guideStage).toBe(1);
    expect(app.persist).toHaveBeenCalledTimes(1);
    app.advanceHangarGuide(1);
    expect(app.persist).toHaveBeenCalledTimes(1);
  });
});
