import { expect, test } from "@playwright/test";

async function openGame(page) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await page.waitForFunction(() => globalThis.__mouseStrikeMiniGame?.state?.scene === "hangar");
}

async function getLayout(page, type) {
  return page.evaluate(async (layoutType) => {
    const api = globalThis.__mouseStrikeMiniGame;
    const module = await import("/src/ui/layout.js");
    const compute = layoutType === "hangar" ? module.computeHangarLayout : module.computeCombatLayout;
    return compute(api.runtime.viewport.width, api.runtime.viewport.height, api.runtime.viewport.safeArea);
  }, type);
}

async function clickRect(page, rect) {
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
}

function collectRuntimeErrors(page) {
  const messages = [];
  page.on("pageerror", (error) => messages.push(error.message));
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error") messages.push(text);
    if (message.type() === "warning" && (text.includes("GL_INVALID") || text.includes("THREE.Color"))) messages.push(text);
  });
  return messages;
}

test("默认机库、中文文字和地图选择可用", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await openGame(page);

  const initial = await page.evaluate(() => {
    const api = globalThis.__mouseStrikeMiniGame;
    const visibleTexts = api.app.renderer.uiLayer.texts.filter((slot) => slot.sprite.visible);
    return {
      fighterId: api.state.fighterId,
      mapId: api.state.mapId,
      qaEnabled: globalThis.__mouseStrikeQA?.enabled === true,
      camera: { top: api.app.renderer.uiCamera.top, bottom: api.app.renderer.uiCamera.bottom },
      labels: visibleTexts.map((slot) => slot.key.split("|")[0]),
      texturesMatch: visibleTexts.every((slot) => (
        slot.canvas.width === Math.max(2, Math.ceil(slot.sprite.scale.x * 2))
        && slot.canvas.height === Math.max(2, Math.ceil(slot.sprite.scale.y * 2))
      )),
    };
  });
  expect(initial.fighterId).toBe("j20");
  expect(initial.mapId).toBe("usa");
  expect(initial.qaEnabled).toBe(true);
  expect(initial.camera).toEqual({ top: 812, bottom: 0 });
  expect(initial.labels).toEqual(expect.arrayContaining(["歼-20 威龙", "驾驶出击"]));
  expect(initial.labels).not.toContain("鼠标突击队");
  expect(initial.texturesMatch).toBe(true);

  const hangar = await getLayout(page, "hangar");
  await clickRect(page, hangar.map);
  await page.waitForFunction(() => globalThis.__mouseStrikeMiniGame?.state?.modal?.type === "map"
    && globalThis.__mouseStrikeMiniGame.state.modal.optionRects?.length === 6);
  expect(await page.evaluate(() => globalThis.__mouseStrikeMiniGame.state.modal.optionRects
    .every((rect) => rect.width >= 44 && rect.height >= 44))).toBe(true);
  const pacific = await page.evaluate(() => globalThis.__mouseStrikeMiniGame.state.modal.optionRects.find((rect) => rect.id === "map:pacific"));
  await clickRect(page, pacific);
  await expect.poll(() => page.evaluate(() => globalThis.__mouseStrikeMiniGame.state.mapId)).toBe("pacific");

  await clickRect(page, hangar.sound);
  await page.waitForFunction(() => globalThis.__mouseStrikeMiniGame?.state?.modal?.type === "settings"
    && globalThis.__mouseStrikeMiniGame.state.modal.optionRects?.length === 7);
  const modalLayers = await page.evaluate(() => {
    const api = globalThis.__mouseStrikeMiniGame;
    const layer = api.app.renderer.uiLayer;
    const backgroundText = layer.texts.find((slot) => slot.sprite.visible && slot.key.startsWith("歼-20 威龙"));
    const modalTitle = layer.texts.find((slot) => slot.sprite.visible && slot.key.startsWith("声音与体验"));
    const backdrop = layer.rects.find((slot) => slot.body.visible
      && Math.round(slot.body.scale.x) === api.runtime.viewport.width
      && Math.round(slot.body.scale.y) === api.runtime.viewport.height);
    return {
      optionSizesValid: api.state.modal.optionRects.every((rect) => rect.width >= 44 && rect.height >= 44),
      backgroundTextOrder: backgroundText?.sprite.renderOrder,
      backdropOrder: backdrop?.body.renderOrder,
      modalTitleOrder: modalTitle?.sprite.renderOrder,
    };
  });
  expect(modalLayers.optionSizesValid).toBe(true);
  expect(modalLayers.backgroundTextOrder).toBeLessThan(modalLayers.backdropOrder);
  expect(modalLayers.backdropOrder).toBeLessThan(modalLayers.modalTitleOrder);
  const closeSettings = await page.evaluate(() => globalThis.__mouseStrikeMiniGame.state.modal.optionRects.find((rect) => rect.id === "close"));
  await clickRect(page, closeSettings);
  await expect.poll(() => page.evaluate(() => globalThis.__mouseStrikeMiniGame.state.modal)).toBe(null);

  await page.setViewportSize({ width: 430, height: 932 });
  await expect.poll(() => page.evaluate(() => globalThis.__mouseStrikeMiniGame.app.renderer.uiCamera.top)).toBe(932);
  expect(runtimeErrors).toEqual([]);
});

test("机库支持拖拽换机、分页直达并保存引导进度", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => globalThis.__mouseStrikeMiniGame?.state?.scene === "hangar");
  const hangar = await getLayout(page, "hangar");
  const selected = hangar.fighterCards.find((card) => card.offset === 0);
  const startX = selected.x + selected.width / 2;
  const y = selected.y + 18;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX - 72, y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => globalThis.__mouseStrikeMiniGame.state.fighterId)).toBe("j35");

  const targetIndex = 6;
  await page.mouse.click(
    hangar.fighterProgress.x + hangar.fighterProgress.width * ((targetIndex + 0.5) / 9),
    hangar.fighterProgress.y + hangar.fighterProgress.height / 2,
  );
  const selectedAfterJump = await page.evaluate(() => ({
    fighterId: globalThis.__mouseStrikeMiniGame.state.fighterId,
    guideStage: globalThis.__mouseStrikeMiniGame.state.hangar.guideStage,
  }));
  expect(selectedAfterJump).toEqual({ fighterId: "gripen", guideStage: 1 });

  await page.reload();
  await page.waitForFunction(() => globalThis.__mouseStrikeMiniGame?.state?.scene === "hangar");
  expect(await page.evaluate(() => ({
    fighterId: globalThis.__mouseStrikeMiniGame.state.fighterId,
    guideStage: globalThis.__mouseStrikeMiniGame.state.hangar.guideStage,
  }))).toEqual(selectedAfterJump);
});

test("机库四模块展示真实参数并保存默认攻击", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => globalThis.__mouseStrikeMiniGame?.state?.scene === "hangar");
  const hangar = await getLayout(page, "hangar");
  const visibleLabels = () => page.evaluate(() => globalThis.__mouseStrikeMiniGame.app.renderer.uiLayer.texts
    .filter((slot) => slot.sprite.visible)
    .map((slot) => slot.key.split("|")[0]));

  await clickRect(page, hangar.previewButtons.find((rect) => rect.id === "transform"));
  await expect.poll(visibleLabels).toEqual(expect.arrayContaining(["变形 · 威龙天将形态", "需要 3 个核心 · 强袭 10 秒 · 变形评分 92"]));

  await clickRect(page, hangar.previewButtons.find((rect) => rect.id === "tactical"));
  await expect.poll(visibleLabels).toEqual(expect.arrayContaining(["被动 · 龙脊贯穿", "自动 6.0 秒 · 扫描锁定 → 龙牙齐射 → 龙脊贯穿"]));

  await clickRect(page, hangar.previewButtons.find((rect) => rect.id === "assault"));
  await expect.poll(visibleLabels).toEqual(expect.arrayContaining(["追踪 · 龙牙追踪弹", "理论DPS"]));
  const firepowerPose = await page.evaluate(() => {
    const api = globalThis.__mouseStrikeMiniGame;
    return {
      progress: api.app.renderer.currentModel.userData.previewProgress,
      visible: api.app.renderer.currentModel.visible,
      hardpoints: Object.keys(api.app.renderer.currentModel.userData.hardpoints),
      startedAt: api.state.hangar.weaponPreviewStartedAt,
    };
  });
  expect(firepowerPose.progress).toBeLessThan(0.01);
  expect(firepowerPose.visible).toBe(false);
  expect(firepowerPose.hardpoints).toHaveLength(8);
  await clickRect(page, hangar.weaponCards.find((rect) => rect.offset === 1));
  expect(await page.evaluate(() => globalThis.__mouseStrikeMiniGame.state.hangar.weaponModeIndex)).toBe(1);
  expect(await page.evaluate(() => globalThis.__mouseStrikeMiniGame.state.hangar.weaponPreviewStartedAt)).toBeGreaterThanOrEqual(firepowerPose.startedAt);
  await expect.poll(visibleLabels).toEqual(expect.arrayContaining(["激光 · 龙脊贯穿激光", "总DPS", "完整照射"]));

  await page.reload();
  await page.waitForFunction(() => globalThis.__mouseStrikeMiniGame?.state?.scene === "hangar");
  expect(await page.evaluate(() => globalThis.__mouseStrikeMiniGame.state.hangar.weaponModeIndex)).toBe(1);
  await page.evaluate(() => globalThis.__mouseStrikeMiniGame.app.startCombat());
  expect(await page.evaluate(() => globalThis.__mouseStrikeMiniGame.state.combat.toolModeIndex)).toBe(1);
});

test("X-10 免费开放并可直接出击", async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => globalThis.__mouseStrikeMiniGame.app.selectFighter("hypersonic"));
  const hangar = await getLayout(page, "hangar");
  let promptCount = 0;
  page.on("dialog", async (dialog) => {
    promptCount += 1;
    await dialog.dismiss();
  });
  await clickRect(page, hangar.start);
  await page.waitForFunction(() => globalThis.__mouseStrikeMiniGame?.state?.scene === "combat");
  expect(promptCount).toBe(0);

  await page.evaluate(() => globalThis.__mouseStrikeMiniGame.app.returnToHangar());
  await page.waitForFunction(() => globalThis.__mouseStrikeMiniGame?.state?.scene === "hangar");
  await clickRect(page, hangar.start);
  await page.waitForFunction(() => globalThis.__mouseStrikeMiniGame?.state?.scene === "combat");
  expect(promptCount).toBe(0);
});

test("战斗返回机库后重置战机的场景深度", async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => globalThis.__mouseStrikeMiniGame.app.startCombat());
  await page.waitForFunction(() => globalThis.__mouseStrikeMiniGame?.state?.scene === "combat");
  await expect.poll(() => page.evaluate(() => Math.abs(globalThis.__mouseStrikeMiniGame.app.renderer.currentModel.position.z))).toBeGreaterThan(100);

  await page.evaluate(() => globalThis.__mouseStrikeMiniGame.app.returnToHangar());
  await page.waitForFunction(() => globalThis.__mouseStrikeMiniGame?.state?.scene === "hangar");
  await expect.poll(() => page.evaluate(() => {
    const renderer = globalThis.__mouseStrikeMiniGame.app.renderer;
    return {
      parentIsHangar: renderer.currentModel.parent === renderer.hangarRoot,
      z: renderer.currentModel.position.z,
      visible: renderer.currentModel.visible,
    };
  })).toEqual({ parentIsHangar: true, z: 0, visible: true });
});

test("九架战机的四种预览完整落在机库安全框内", async ({ page }) => {
  await openGame(page);
  const results = await page.evaluate(async () => {
    const api = globalThis.__mouseStrikeMiniGame;
    const THREE = await import("/@fs/Users/ziheng/mouse-strike-minigame/node_modules/three/build/three.module.js");
    const { FIGHTER_ORDER } = await import("/src/content/fighter-profiles.js");
    const { computeHangarLayout } = await import("/src/ui/layout.js");
    const layout = computeHangarLayout(api.runtime.viewport.width, api.runtime.viewport.height, api.runtime.viewport.safeArea);
    const rows = [];
    for (const fighterId of FIGHTER_ORDER) {
      api.app.selectFighter(fighterId);
      api.state.hangar.transition = 0;
      const modes = [];
      for (const mode of ["flight", "transform", "assault", "tactical"]) {
        api.state.hangar.previewMode = mode;
        api.app.renderer.render(api.state, 0.016);
        const model = api.app.renderer.currentModel;
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        const points = [];
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
          const point = new THREE.Vector3(x, y, z).project(api.app.renderer.hangarCamera);
          points.push({
            x: (point.x + 1) / 2 * api.runtime.viewport.width,
            y: (1 - point.y) / 2 * api.runtime.viewport.height,
          });
        }
        modes.push({
          mode,
          minX: Math.min(...points.map((point) => point.x)),
          maxX: Math.max(...points.map((point) => point.x)),
          minY: Math.min(...points.map((point) => point.y)),
          maxY: Math.max(...points.map((point) => point.y)),
        });
      }
      rows.push({ fighterId, modes, profile: api.app.renderer.currentModel.userData.fighterId });
    }
    return { rows, preview: layout.preview };
  });
  expect(results.rows).toHaveLength(9);
  for (const row of results.rows) {
    expect(row.profile).toBe(row.fighterId);
    expect(row.modes).toHaveLength(4);
    for (const bounds of row.modes) {
      expect(bounds.minX).toBeGreaterThanOrEqual(results.preview.x);
      expect(bounds.maxX).toBeLessThanOrEqual(results.preview.x + results.preview.width);
      expect(bounds.minY).toBeGreaterThanOrEqual(results.preview.y);
      expect(bounds.maxY).toBeLessThanOrEqual(results.preview.y + results.preview.height);
    }
  }
});

test("武器、被动、变身、自动僚机和双触点操作互不冲突", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await openGame(page);
  const hangar = await getLayout(page, "hangar");
  await clickRect(page, hangar.start);
  await page.waitForFunction(() => globalThis.__mouseStrikeMiniGame?.state?.scene === "combat");
  const combatLayout = await getLayout(page, "combat");

  await clickRect(page, combatLayout.weapon);
  expect(await page.evaluate(() => globalThis.__mouseStrikeMiniGame.state.combat.toolModeIndex)).toBe(1);

  await page.evaluate(() => { globalThis.__mouseStrikeMiniGame.state.combat.passiveTimer = 0; });
  await page.waitForFunction(() => globalThis.__mouseStrikeMiniGame.state.combat.passiveUses > 0);

  await clickRect(page, combatLayout.actions.transform);
  expect(await page.evaluate(() => globalThis.__mouseStrikeMiniGame.state.combat.transformed)).toBe(false);
  await page.evaluate(() => {
    const system = globalThis.__mouseStrikeMiniGame.app.combatSystem;
    system.state.transformCores = 0;
    system.collectPickup("core");
    system.collectPickup("core");
    system.collectPickup("core");
  });
  await page.waitForFunction(() => globalThis.__mouseStrikeMiniGame.app.renderer.hudLayer.texts
    .some((slot) => slot.sprite.visible && slot.key.startsWith("能量已满，点击右侧“变身”|")));
  await clickRect(page, combatLayout.actions.transform);
  const transformed = await page.evaluate(() => ({
    active: globalThis.__mouseStrikeMiniGame.state.combat.transformed,
    cores: globalThis.__mouseStrikeMiniGame.state.combat.transformCores,
  }));
  expect(transformed).toEqual({ active: true, cores: 0 });

  await page.evaluate(() => {
    const api = globalThis.__mouseStrikeMiniGame;
    api.state.combat.elapsed = 15;
    api.state.combat.wingmanCooldown = 0;
    api.state.combat.autoWingmanTimer = 0;
    api.state.combat.pendingMissionId = "e2e-input-lock";
  });
  await page.evaluate(() => globalThis.__mouseStrikeMiniGame.app.combatSystem.updateAutoWingman(0));
  expect(await page.evaluate(() => globalThis.__mouseStrikeMiniGame.state.combat.entities.allies.length)).toBeGreaterThan(0);

  const multiTouch = await page.evaluate(async () => {
    const api = globalThis.__mouseStrikeMiniGame;
    api.state.modal = null;
    api.state.paused = false;
    const { computeCombatLayout } = await import("/src/ui/layout.js");
    const layout = computeCombatLayout(api.runtime.viewport.width, api.runtime.viewport.height, api.runtime.viewport.safeArea);
    const move = { identifier: 71, clientX: 90, clientY: 520 };
    const action = {
      identifier: 72,
      clientX: layout.weapon.x + layout.weapon.width / 2,
      clientY: layout.weapon.y + layout.weapon.height / 2,
    };
    api.app.onTouchStart({ changedTouches: [move, action], touches: [move, action] });
    return {
      roles: [...api.app.combatTouches.values()].map((touch) => touch.role).sort(),
      player: { x: api.state.combat.player.x, y: api.state.combat.player.y },
    };
  });
  expect(multiTouch.roles).toEqual(["action:form", "move"]);
  expect(multiTouch.player.x).toBeCloseTo(90, 0);
  expect(multiTouch.player.y).toBeCloseTo(520 - 54, 0);
  expect(runtimeErrors).toEqual([]);
});

test("紫色进化补给提供三项专属强化并立即生效", async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => globalThis.__mouseStrikeMiniGame.app.startCombat());
  await page.evaluate(() => globalThis.__mouseStrikeMiniGame.app.combatSystem.collectPickup("evolution"));
  await page.waitForFunction(() => globalThis.__mouseStrikeMiniGame.state.modal?.type === "upgrade"
    && globalThis.__mouseStrikeMiniGame.state.modal.optionRects?.length === 3);
  const choice = await page.evaluate(() => globalThis.__mouseStrikeMiniGame.state.modal.optionRects[0]);
  await clickRect(page, choice);
  const result = await page.evaluate(() => ({
    paused: globalThis.__mouseStrikeMiniGame.state.paused,
    modal: globalThis.__mouseStrikeMiniGame.state.modal,
    upgrades: globalThis.__mouseStrikeMiniGame.state.combat.upgrades,
  }));
  expect(result.paused).toBe(false);
  expect(result.modal).toBe(null);
  expect(result.upgrades).toHaveLength(1);
});

test("战斗 HUD 与暂停弹窗在窄屏保持完整", async ({ page }) => {
  await openGame(page);
  const hangar = await getLayout(page, "hangar");
  await clickRect(page, hangar.start);
  await page.waitForFunction(() => globalThis.__mouseStrikeMiniGame?.state?.scene === "combat");
  await page.waitForTimeout(500);

  const combatModel = await page.evaluate(() => {
    const renderer = globalThis.__mouseStrikeMiniGame.app.renderer;
    return {
      modelId: renderer.modelId,
      parent: renderer.currentModel?.parent?.uuid,
      combatRoot: renderer.combatRoot?.uuid,
      materialCount: renderer.currentModel?.userData?.materials ? Object.keys(renderer.currentModel.userData.materials).length : 0,
      scale: renderer.currentModel?.scale.x,
    };
  });
  expect(combatModel.modelId).toBe("j20");
  expect(combatModel.parent).toBe(combatModel.combatRoot);
  expect(combatModel.materialCount).toBeGreaterThanOrEqual(6);
  expect(combatModel.scale).toBeGreaterThan(0.6);

  const labels = await page.evaluate(() => globalThis.__mouseStrikeMiniGame.app.renderer.hudLayer.texts
    .filter((slot) => slot.sprite.visible)
    .map((slot) => slot.key.split("|")[0]));
  expect(labels).toEqual(expect.arrayContaining(["中国 / 歼-20", "武器 1/3", "龙牙追踪弹", "变身"]));
  expect(labels.some((label) => label.startsWith("被动 · 龙脊贯穿"))).toBe(true);
  expect(labels).not.toEqual(expect.arrayContaining(["攻击", "僚机"]));
  expect(labels.some((label) => label.includes("高价值锁定"))).toBe(true);

  const combat = await getLayout(page, "combat");
  await clickRect(page, combat.pause);
  await page.waitForFunction(() => globalThis.__mouseStrikeMiniGame?.state?.modal?.type === "pause"
    && globalThis.__mouseStrikeMiniGame.state.modal.optionRects?.length === 2);
  expect(await page.evaluate(() => globalThis.__mouseStrikeMiniGame.state.paused)).toBe(true);
  const resume = await page.evaluate(() => globalThis.__mouseStrikeMiniGame.state.modal.optionRects.find((rect) => rect.id === "resume"));
  await clickRect(page, resume);
  await expect.poll(() => page.evaluate(() => globalThis.__mouseStrikeMiniGame.state.paused)).toBe(false);

  await page.setViewportSize({ width: 812, height: 375 });
  await page.waitForFunction(() => globalThis.__mouseStrikeMiniGame?.state?.modal?.type === "orientation");
  expect(await page.evaluate(() => globalThis.__mouseStrikeMiniGame.state.paused)).toBe(true);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForFunction(() => globalThis.__mouseStrikeMiniGame?.state?.modal?.type === "resume");
});

test("分包失败显示重试，恢复后继续进入战斗", async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    const api = globalThis.__mouseStrikeMiniGame;
    api.app.selectFighter("j35");
    let attempts = 0;
    api.resources.ensure = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("offline");
      return ["fighters-cn-us"];
    };
  });
  const hangar = await getLayout(page, "hangar");
  await clickRect(page, hangar.start);
  await page.waitForFunction(() => globalThis.__mouseStrikeMiniGame?.state?.modal?.type === "error"
    && globalThis.__mouseStrikeMiniGame.state.modal.optionRects?.length === 2);
  const ids = await page.evaluate(() => globalThis.__mouseStrikeMiniGame.state.modal.optionRects.map((rect) => rect.id));
  expect(ids).toEqual(["retry-load", "close"]);
  const retry = await page.evaluate(() => globalThis.__mouseStrikeMiniGame.state.modal.optionRects.find((rect) => rect.id === "retry-load"));
  await clickRect(page, retry);
  await page.waitForFunction(() => globalThis.__mouseStrikeMiniGame?.state?.scene === "combat");
});

test("分包加载可以留在机库，完成中的请求不会误启动战斗", async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    const api = globalThis.__mouseStrikeMiniGame;
    api.app.selectFighter("j35");
    api.resources.ensure = () => new Promise((resolve) => {
      api.resolvePendingPackage = resolve;
    });
  });
  const hangar = await getLayout(page, "hangar");
  await clickRect(page, hangar.start);
  await page.waitForFunction(() => globalThis.__mouseStrikeMiniGame?.state?.modal?.type === "loading"
    && globalThis.__mouseStrikeMiniGame.state.modal.optionRects?.length === 1);
  const cancel = await page.evaluate(() => globalThis.__mouseStrikeMiniGame.state.modal.optionRects[0]);
  await clickRect(page, cancel);
  await page.evaluate(() => globalThis.__mouseStrikeMiniGame.resolvePendingPackage([]));
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => ({
    scene: globalThis.__mouseStrikeMiniGame.state.scene,
    modal: globalThis.__mouseStrikeMiniGame.state.modal,
  }))).toEqual({ scene: "hangar", modal: null });
});

test("死亡结算完整且不出现强化模块，可直接重新开始", async ({ page }) => {
  await openGame(page);
  const hangar = await getLayout(page, "hangar");
  await clickRect(page, hangar.start);
  await page.waitForFunction(() => globalThis.__mouseStrikeMiniGame?.state?.scene === "combat");
  await page.evaluate(() => {
    const api = globalThis.__mouseStrikeMiniGame;
    api.state.combat.player.invulnerable = 0;
    api.state.combat.player.shieldCharges = 0;
    api.state.combat.barrierTime = 0;
    api.app.combatSystem.damagePlayer(0, 0, 9999);
  });
  await page.waitForFunction(() => globalThis.__mouseStrikeMiniGame?.state?.modal?.type === "result"
    && globalThis.__mouseStrikeMiniGame.state.modal.optionRects?.length === 2);
  const result = await page.evaluate(() => ({
    lines: globalThis.__mouseStrikeMiniGame.state.modal.lines,
    options: globalThis.__mouseStrikeMiniGame.state.modal.optionRects.map((rect) => rect.id),
  }));
  expect(result.lines.join(" ")).toContain("战斗风格");
  expect(result.lines.join(" ")).not.toContain("强化模块");
  expect(result.options).toEqual(["restart", "hangar"]);
  const restart = await page.evaluate(() => globalThis.__mouseStrikeMiniGame.state.modal.optionRects.find((rect) => rect.id === "restart"));
  await clickRect(page, restart);
  await page.waitForFunction(() => globalThis.__mouseStrikeMiniGame?.state?.scene === "combat"
    && globalThis.__mouseStrikeMiniGame.state.combat.ended === false);
});

test("设置通过界面修改后可在再次启动时恢复", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => globalThis.__mouseStrikeMiniGame?.state?.scene === "hangar");
  await page.evaluate(() => globalThis.__mouseStrikeMiniGame.app.openSettings());
  const clickSetting = async (id) => {
    await page.waitForFunction((optionId) => globalThis.__mouseStrikeMiniGame.state.modal?.optionRects?.some((rect) => rect.id === optionId), id);
    const rect = await page.evaluate((optionId) => globalThis.__mouseStrikeMiniGame.state.modal.optionRects.find((item) => item.id === optionId), id);
    await clickRect(page, rect);
  };
  await clickSetting("settings:mute");
  await clickSetting("settings:quality");
  await clickSetting("settings:haptics");
  await clickSetting("settings:effects");
  await clickSetting("settings:motion");
  const beforeReload = await page.evaluate(() => globalThis.__mouseStrikeMiniGame.state.settings);
  expect(beforeReload).toMatchObject({ muted: true, quality: "low", haptics: false, effects: "reduced", reducedMotion: true });

  await page.reload();
  await page.waitForFunction(() => globalThis.__mouseStrikeMiniGame?.state?.scene === "hangar");
  expect(await page.evaluate(() => globalThis.__mouseStrikeMiniGame.state.settings)).toMatchObject(beforeReload);
});

test("切到后台会冻结变身和冷却，返回后要求用户确认", async ({ page }) => {
  await openGame(page);
  const hangar = await getLayout(page, "hangar");
  await clickRect(page, hangar.start);
  await page.waitForFunction(() => globalThis.__mouseStrikeMiniGame?.state?.scene === "combat");
  await page.evaluate(() => {
    const api = globalThis.__mouseStrikeMiniGame;
    api.state.combat.transformCores = 3;
    api.app.combatSystem.tryTransform();
    api.state.combat.passiveTimer = 7;
    window.dispatchEvent(new Event("blur"));
  });
  const frozen = await page.evaluate(() => ({
    elapsed: globalThis.__mouseStrikeMiniGame.state.combat.elapsed,
    transform: globalThis.__mouseStrikeMiniGame.state.combat.transformTime,
    passive: globalThis.__mouseStrikeMiniGame.state.combat.passiveTimer,
  }));
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => ({
    elapsed: globalThis.__mouseStrikeMiniGame.state.combat.elapsed,
    transform: globalThis.__mouseStrikeMiniGame.state.combat.transformTime,
    passive: globalThis.__mouseStrikeMiniGame.state.combat.passiveTimer,
  }))).toEqual(frozen);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(() => globalThis.__mouseStrikeMiniGame.state.modal?.type === "resume");
  expect(await page.evaluate(() => globalThis.__mouseStrikeMiniGame.state.paused)).toBe(true);
});
