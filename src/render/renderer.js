import * as THREE from "three";
import { BATTLE_MAPS } from "../content/battle-maps.js";
import { FIGHTER_ORDER, FIGHTERS } from "../content/fighter-profiles.js";
import { MINI_MISSIONS } from "../content/mini-missions.js";
import { computeCombatLayout, computeHangarLayout } from "../ui/layout.js";
import { createFighterModel, updateFighterModel } from "./fighter-model.js";
import { ImmediateLayer } from "./immediate-layer.js";

const COLORS = {
  paper: "#071a28",
  surface: "#102d3c",
  surfaceStrong: "#173e50",
  ink: "#edf8fb",
  soft: "#96aeb8",
  line: "#2b5b6d",
  red: "#ff6254",
  redDark: "#ff9a73",
  muted: "#173543",
  green: "#42d39a",
  blue: "#39cdf3",
  gold: "#f4bd4d",
  battleInk: "#061722",
};

const MAP_VISUALS = {
  usa: { sky: "#12384d", deep: "#071e2c", haze: "#5b91a8", streak: "#b8dbe6" },
  pacific: { sky: "#164754", deep: "#062630", haze: "#4e9eaa", streak: "#b6e1e4" },
  arctic: { sky: "#194d55", deep: "#08282f", haze: "#62bea8", streak: "#c8f3e9" },
  "sky-corridor": { sky: "#183f60", deep: "#091d33", haze: "#4b8fc5", streak: "#c0e5ff" },
  "meteor-rift": { sky: "#492d42", deep: "#1b1525", haze: "#a05d6c", streak: "#ffd09a" },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function wrapLine(line, max = 25) {
  const value = String(line);
  if (value.length <= max) return [value];
  const result = [];
  for (let index = 0; index < value.length; index += max) result.push(value.slice(index, index + max));
  return result;
}

function layerGuide(layer, { x, y, width, text, accent }) {
  layer.rect({ x, y, width, height: 30, color: COLORS.battleInk, opacity: 0.94, border: accent, z: 34 });
  layer.text(text, { x: x + 8, y: y + 3, width: width - 16, height: 24, color: COLORS.ink, fontSize: 9, align: "center", weight: 850, z: 35 });
}

export class GameRenderer {
  constructor(runtime, state) {
    this.runtime = runtime;
    this.state = state;
    this.width = runtime.viewport.width;
    this.height = runtime.viewport.height;
    this.renderer = new THREE.WebGLRenderer({ canvas: runtime.canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(runtime.viewport.pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = state.settings.quality === "high";
    this.uiScene = new THREE.Scene();
    this.uiCamera = new THREE.OrthographicCamera(0, this.width, this.height, 0, 0.1, 200);
    this.uiCamera.position.z = 100;
    this.uiLayer = new ImmediateLayer(runtime);
    this.uiScene.add(this.uiLayer.group);
    this.hangarScene = new THREE.Scene();
    this.hangarScene.background = new THREE.Color(COLORS.paper);
    this.hangarCamera = new THREE.PerspectiveCamera(38, this.width / this.height, 0.1, 2000);
    this.hangarCamera.position.set(0, 128, 390);
    this.hangarCamera.lookAt(0, 0, 0);
    this.hangarRoot = new THREE.Group();
    this.hangarScene.add(this.hangarRoot);
    this.hangarScene.add(new THREE.HemisphereLight(0xa8eaff, 0x07111a, 2.5));
    const key = new THREE.DirectionalLight(0xeefaff, 4.4);
    key.position.set(-120, 170, 130);
    key.castShadow = true;
    this.hangarScene.add(key);
    const fill = new THREE.DirectionalLight(0x53d8ff, 2.6);
    fill.position.set(120, 40, 120);
    this.hangarScene.add(fill);
    const rim = new THREE.DirectionalLight(0x86dfff, 1.5);
    rim.position.set(80, 90, -140);
    this.hangarScene.add(rim);
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(118, 64),
      new THREE.MeshStandardMaterial({ color: 0x0b2432, metalness: 0.66, roughness: 0.58 }),
    );
    pad.name = "hangar-pad";
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(0, -25, 12);
    pad.receiveShadow = true;
    const outerRing = new THREE.Mesh(new THREE.TorusGeometry(104, 1.25, 8, 64), new THREE.MeshBasicMaterial({ color: 0x2dbde6 }));
    outerRing.rotation.x = Math.PI / 2;
    outerRing.position.set(0, -23.5, 12);
    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(68, 0.7, 6, 64), new THREE.MeshBasicMaterial({ color: 0x31596a }));
    innerRing.rotation.x = Math.PI / 2;
    innerRing.position.set(0, -23.2, 12);
    this.hangarRoot.add(pad, outerRing, innerRing);
    this.hangarPad = pad;
    this.hangarOuterRing = outerRing;
    this.hangarInnerRing = innerRing;
    this.hangarTheme = new THREE.Color(COLORS.paper);
    this.hangarTargetTheme = new THREE.Color(COLORS.paper);
    this.displayStats = { mobility: 0, firepower: 0, armor: 0 };
    this.currentModel = null;
    this.modelId = null;
    this.time = 0;
    this.quality = state.settings.quality;
  }

  resize(viewport) {
    this.width = viewport.width;
    this.height = viewport.height;
    this.setQuality(this.quality);
    this.renderer.setSize(this.width, this.height, false);
    this.uiCamera.right = this.width;
    this.uiCamera.top = this.height;
    this.uiCamera.bottom = 0;
    this.uiCamera.updateProjectionMatrix();
    this.hangarCamera.aspect = this.width / this.height;
    this.hangarCamera.updateProjectionMatrix();
  }

  setQuality(tier) {
    this.quality = tier;
    const maximum = this.runtime.viewport.pixelRatio;
    const ratio = tier === "low" ? 1 : tier === "medium" ? Math.min(1.5, maximum) : maximum;
    this.renderer.setPixelRatio(ratio);
    this.renderer.shadowMap.enabled = tier === "high";
  }

  releaseUnused() {
    this.renderer.renderLists?.dispose?.();
  }

  setFighter(fighterId) {
    if (this.modelId === fighterId) return;
    if (this.currentModel) {
      this.hangarRoot.remove(this.currentModel);
      this.currentModel.traverse((item) => {
        item.geometry?.dispose?.();
        if (Array.isArray(item.material)) item.material.forEach((material) => material.dispose?.());
        else item.material?.dispose?.();
      });
    }
    this.currentModel = createFighterModel(FIGHTERS[fighterId]);
    this.currentModel.scale.setScalar(Math.min(1.2, this.width / 340) * (FIGHTERS[fighterId].rig.cameraScale || 1));
    this.currentModel.rotation.x = 0.48;
    this.hangarRoot.add(this.currentModel);
    this.modelId = fighterId;
    const accent = new THREE.Color(FIGHTERS[fighterId].accent);
    this.hangarTargetTheme.copy(accent).multiplyScalar(0.12).add(new THREE.Color(0x04121d));
    this.hangarOuterRing.material.color.copy(accent);
  }

  render(state, delta = 0) {
    this.time += delta;
    this.frameDelta = delta;
    if (state.scene === "hangar" || state.scene === "loading") this.renderHangar(state);
    else this.renderCombat(state);
  }

  renderHangar(state) {
    this.setFighter(state.fighterId);
    updateFighterModel(this.currentModel, state.hangar.previewMode, this.time, state.hangar.modelRotation);
    const layout = computeHangarLayout(this.width, this.height, this.runtime.viewport.safeArea, this.runtime.viewport.menuButton);
    const previewCenterY = layout.preview.y + layout.preview.height * 0.46;
    const scale = Math.max(0.48, Math.min(0.68, layout.preview.height / 560));
    const transition = state.settings.reducedMotion ? 0 : state.hangar.transition || 0;
    this.currentModel.scale.setScalar(scale * (FIGHTERS[state.fighterId].rig.cameraScale || 1) * (1 - Math.abs(transition) * 0.055));
    this.currentModel.position.x = transition * 28;
    this.currentModel.rotation.y += transition * -0.16;
    this.hangarRoot.position.set(0, (this.height * 0.5 - previewCenterY) * 0.29, 0);
    this.hangarTheme.lerp(this.hangarTargetTheme, Math.min(1, (this.frameDelta || 0.016) * 5));
    this.hangarScene.background.copy(this.hangarTheme);
    if (!state.settings.reducedMotion && this.quality !== "low") {
      this.hangarOuterRing.rotation.z = this.time * 0.12;
      this.hangarInnerRing.rotation.z = -this.time * 0.08;
      this.hangarPad.material.emissive?.set?.(FIGHTERS[state.fighterId].accent);
      if (this.hangarPad.material.emissive) this.hangarPad.material.emissiveIntensity = 0.06 + Math.sin(this.time * 1.5) * 0.015;
    }
    this.renderer.setScissorTest(false);
    this.renderer.setClearColor(this.hangarTheme);
    this.renderer.clear(true, true, true);
    this.renderer.setScissorTest(true);
    this.renderer.setScissor(
      layout.preview.x,
      this.height - layout.preview.y - layout.preview.height,
      layout.preview.width,
      layout.preview.height,
    );
    this.renderer.autoClear = true;
    this.renderer.render(this.hangarScene, this.hangarCamera);
    this.renderer.setScissorTest(false);
    this.drawHangarUi(state, layout);
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.render(this.uiScene, this.uiCamera);
  }

  drawHangarUi(state, layout) {
    const fighter = FIGHTERS[state.fighterId];
    const layer = this.uiLayer;
    layer.begin();
    this.button(layer, layout.sound, "设置", false, "surface", 24, state.uiPress === "sound");

    const radarX = this.width / 2;
    const radarY = layout.preview.y + layout.preview.height * 0.45;
    [62, 100, 142].forEach((radius, index) => layer.circle({ x: radarX, y: radarY, radius, color: fighter.accent, opacity: 0.018, border: index === 1 ? COLORS.line : null, z: -1 }));
    layer.line({ x1: layout.pad, y1: layout.preview.y + 4, x2: layout.pad + 46, y2: layout.preview.y + 4, width: 2, color: COLORS.blue, opacity: 0.74, z: 2 });
    layer.line({ x1: this.width - layout.pad - 46, y1: layout.preview.y + 4, x2: this.width - layout.pad, y2: layout.preview.y + 4, width: 2, color: COLORS.blue, opacity: 0.74, z: 2 });
    const previewLabels = { flight: "飞行\n巡航姿态", transform: "变形\n机甲形态", assault: "火力\n强袭演示", tactical: "技能\n专属战术" };
    layout.previewButtons.forEach((button) => this.button(
      layer,
      button,
      previewLabels[button.id],
      state.hangar.previewMode === button.id,
      "surface",
      24,
      state.uiPress === `preview:${button.id}`,
    ));

    layer.rect({ ...layout.info, color: COLORS.surface, opacity: 0.9, border: COLORS.line, z: 1 });
    layer.rect({ x: layout.info.x, y: layout.info.y, width: 4, height: layout.info.height, color: fighter.accent, z: 2 });
    const compactInfo = layout.info.height < 106;
    layer.text(`${fighter.country} · ${fighter.role.split("/")[0].trim()}`, { x: layout.info.x + 14, y: layout.info.y + 8, width: layout.info.width - 28, height: 18, color: fighter.accent, fontSize: 9, weight: 900 });
    layer.text(fighter.displayName, { x: layout.info.x + 14, y: layout.info.y + 27, width: layout.info.width - 28, height: compactInfo ? 29 : 35, color: COLORS.ink, fontSize: compactInfo ? 20 : 23, weight: 900 });
    if (!compactInfo) layer.text(`${fighter.passiveName} · ${fighter.tactical.name}`, { x: layout.info.x + 14, y: layout.info.y + 60, width: layout.info.width - 28, height: 20, color: COLORS.soft, fontSize: 10, weight: 800 });
    const blend = state.settings.reducedMotion ? 1 : Math.min(1, (this.frameDelta || 0.016) * 8);
    this.displayStats.mobility += (fighter.stats.mobility - this.displayStats.mobility) * blend;
    this.displayStats.firepower += (fighter.stats.firepower - this.displayStats.firepower) * blend;
    this.displayStats.armor += (fighter.stats.armor - this.displayStats.armor) * blend;
    const stats = [["机动", this.displayStats.mobility], ["火力", this.displayStats.firepower], ["耐久", this.displayStats.armor]];
    const statY = layout.info.y + layout.info.height - 14;
    stats.forEach(([name, value], index) => {
      const slot = (layout.info.width - 28) / 3;
      const x = layout.info.x + 14 + index * slot;
      layer.text(`${name} ${Math.round(value)}`, { x, y: statY - 15, width: slot - 8, height: 14, color: COLORS.soft, fontSize: 8, weight: 800 });
      layer.rect({ x, y: statY, width: slot - 10, height: 3, color: COLORS.muted, z: 2 });
      layer.rect({ x, y: statY, width: (slot - 10) * value / 100, height: 3, color: fighter.accent, z: 3 });
    });

    const selectedIndex = FIGHTER_ORDER.indexOf(state.fighterId);
    const dragOffset = state.hangar.dragOffset || 0;
    layout.fighterCards.forEach((card) => {
      const index = (selectedIndex + card.offset + FIGHTER_ORDER.length) % FIGHTER_ORDER.length;
      const item = FIGHTERS[FIGHTER_ORDER[index]];
      const selected = card.offset === 0;
      const pressed = state.uiPress === `fighter:${card.offset}`;
      const shiftedCard = { ...card, x: card.x + dragOffset };
      const rect = pressed ? { ...shiftedCard, x: shiftedCard.x + 2, y: shiftedCard.y + 2, width: shiftedCard.width - 4, height: shiftedCard.height - 4 } : shiftedCard;
      layer.rect({ ...rect, color: selected ? COLORS.surfaceStrong : COLORS.surface, opacity: selected ? 1 : 0.58, border: selected ? item.accent : COLORS.line, z: 1 });
      layer.text(item.country, { x: rect.x + 7, y: rect.y + 6, width: rect.width - 14, height: 14, color: selected ? item.accent : COLORS.soft, fontSize: 7.5, align: "center", weight: 800 });
      layer.text(item.displayName, { x: rect.x + 5, y: rect.y + 22, width: rect.width - 10, height: 26, color: COLORS.ink, fontSize: selected ? 12 : 9.5, align: "center", weight: 900 });
      if (!selected) layer.text(card.offset < 0 ? "‹" : "›", { x: rect.x, y: rect.y + 9, width: rect.width, height: 36, color: item.accent, fontSize: 22, align: card.offset < 0 ? "left" : "right", weight: 900, z: 3 });
    });

    const dotGap = 10;
    const dotStart = this.width / 2 - ((FIGHTER_ORDER.length - 1) * dotGap) / 2;
    FIGHTER_ORDER.forEach((_, index) => layer.circle({
      x: dotStart + index * dotGap,
      y: layout.cards.y + layout.cards.height + 5,
      radius: index === selectedIndex ? 2.8 : 1.8,
      color: index === selectedIndex ? fighter.accent : COLORS.muted,
      opacity: index === selectedIndex ? 1 : 0.65,
      z: 3,
    }));

    this.drawHangarGuide(state, layout, fighter);
    this.button(layer, layout.map, BATTLE_MAPS[state.mapId].name, false, "surface", 24, state.uiPress === "map");
    this.button(layer, layout.start, state.fighterId === "hypersonic" ? "验证暗号并出击" : "驾驶出击", false, "primary", 24, state.uiPress === "start", fighter.accent);
    this.drawToast(state, layout.preview.y + layout.preview.height - 52);
    if (state.modal) this.drawModal(state.modal);
    layer.end();
  }

  renderCombat(state) {
    const combat = state.combat;
    const map = BATTLE_MAPS[state.mapId];
    const fighter = FIGHTERS[state.fighterId];
    const layer = this.uiLayer;
    const layout = computeCombatLayout(this.width, this.height, this.runtime.viewport.safeArea, this.runtime.viewport.menuButton);
    this.renderer.setClearColor(map.background);
    this.renderer.autoClear = true;
    this.renderer.clear();
    layer.begin();
    const feedbackScale = state.settings.effects === "reduced" ? 0.35 : 1;
    const shakeX = combat.shake > 0 ? Math.sin(this.time * 68) * combat.shake * 0.35 * feedbackScale : 0;
    const shakeY = combat.shake > 0 ? Math.cos(this.time * 57) * combat.shake * 0.25 * feedbackScale : 0;
    this.drawBattleBackground(layer, map, combat, shakeX, shakeY);
    this.drawMapStructures(layer, combat, shakeX, shakeY);
    this.drawMission(layer, combat, shakeX, shakeY);
    this.drawAirdrop(layer, combat, shakeX, shakeY);
    this.drawMeteors(layer, combat, shakeX, shakeY);
    this.drawProjectiles(layer, combat, shakeX, shakeY);
    this.drawEnemies(layer, combat, shakeX, shakeY);
    this.drawBoss(layer, combat, shakeX, shakeY);
    this.drawPickups(layer, combat, shakeX, shakeY);
    this.drawAllies(layer, combat, fighter, shakeX, shakeY);
    this.drawPlayer(layer, combat, fighter, shakeX, shakeY);
    this.drawParticles(layer, combat, shakeX, shakeY);
    this.drawCombatHud(layer, state, combat, fighter, layout);
    this.drawCombatFeedback(layer, state, combat);
    this.drawToast(state, this.height - 150);
    if (state.modal) this.drawModal(state.modal);
    layer.end();
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.render(this.uiScene, this.uiCamera);
    combat.quality.drawCalls = this.renderer.info.render.calls;
  }

  drawBattleBackground(layer, map, combat, ox, oy) {
    const visual = MAP_VISUALS[map.id] || MAP_VISUALS.usa;
    layer.rect({ x: 0, y: 0, width: this.width, height: this.height, color: visual.deep, z: -20 });
    layer.rect({ x: 0, y: 0, width: this.width, height: this.height * 0.54, color: visual.sky, opacity: 0.96, z: -19 });
    layer.rect({ x: 0, y: this.height * 0.46, width: this.width, height: this.height * 0.2, color: visual.haze, opacity: 0.12, z: -18 });
    const scroll = (combat.elapsed * map.structureSpeed * 0.7) % 220;
    for (let index = 0; index < 6; index += 1) {
      const y = ((index * 154 + scroll) % (this.height + 180)) - 90;
      const drift = ((index * 73) % 120) - 60;
      layer.line({ x1: this.width * 0.5 + drift * 0.12 + ox, y1: 96 + oy, x2: this.width * 0.5 + drift * 2.8 + ox, y2: y + oy, width: index % 2 ? 2 : 4, color: visual.streak, opacity: index % 2 ? 0.13 : 0.08, z: -17 });
    }
    if (map.id === "pacific") {
      for (let index = 0; index < 7; index += 1) {
        const x = (index * 67 + combat.elapsed * 46) % (this.width + 60) - 30;
        layer.line({ x1: x, y1: 100, x2: x - 28, y2: this.height, width: 1, color: "#b8edf2", opacity: 0.16, z: -16 });
      }
    } else if (map.id === "arctic") {
      for (let index = 0; index < 3; index += 1) {
        const wave = Math.sin(this.time * 0.7 + index) * 30;
        layer.line({ x1: -20, y1: 160 + index * 46 + wave, x2: this.width + 20, y2: 112 + index * 58 - wave, width: 12 - index * 2, color: index % 2 ? "#5be7c1" : "#68baf0", opacity: 0.09, z: -16 });
      }
    } else if (map.id === "meteor-rift") {
      for (let index = 0; index < 16; index += 1) {
        const x = (index * 83) % this.width;
        const y = (index * 137 + combat.elapsed * 24) % this.height;
        layer.circle({ x, y, radius: index % 4 === 0 ? 2 : 1, color: "#ffd6a0", opacity: 0.42, z: -16 });
      }
    } else {
      for (let index = 0; index < 4; index += 1) {
        const y = 130 + ((index * 190 + scroll * 0.42) % Math.max(220, this.height - 160));
        layer.line({ x1: -30, y1: y, x2: this.width + 30, y2: y + 14, width: 18, color: visual.streak, opacity: 0.035, z: -16 });
      }
    }
    layer.text(map.name, { x: 14, y: Math.max(108, this.runtime.viewport.safeArea.top + 76), width: this.width - 28, height: 20, color: visual.streak, fontSize: 8, weight: 900, z: -15 });
  }

  drawMapStructures(layer, combat, ox, oy) {
    const palette = { gate: "#2f93b2", danger: "#df5e50", rift: "#bc5270", "storm-core": "#34a7b8", "aurora-field": "#4bcba3", reflector: "#6c9fc1", breakable: "#b97a55" };
    for (const structure of combat.mapStructures) {
      if (structure.destroyed || structure.y > this.height + 80 || structure.y + structure.height < -80) continue;
      const color = palette[structure.kind] || (structure.breakable ? "#a66f57" : "#516b77");
      const opacity = structure.open ? 0.12 : structure.solid === false ? 0.24 : 0.68;
      const x = structure.x + ox;
      const y = structure.y + oy;
      layer.rect({ x, y, width: structure.width, height: structure.height, color: COLORS.battleInk, opacity: Math.min(0.9, opacity + 0.14), border: structure.open ? COLORS.green : color, z: -8 });
      layer.line({ x1: x + 5, y1: y + 5, x2: x + Math.min(34, structure.width * 0.28), y2: y + 5, width: 3, color, opacity, z: -7 });
      layer.line({ x1: x + structure.width - 5, y1: y + structure.height - 5, x2: x + structure.width - Math.min(34, structure.width * 0.28), y2: y + structure.height - 5, width: 3, color, opacity, z: -7 });
      if (structure.solid === false) layer.line({ x1: x, y1: y, x2: x + structure.width, y2: y + structure.height, width: 2, color, opacity: 0.5, z: -7 });
      if (structure.kind === "gate") layer.text(structure.open ? "通道开放" : "能源门", { x, y: y + structure.height / 2 - 8, width: structure.width, height: 16, color: structure.open ? COLORS.green : COLORS.ink, fontSize: 8, align: "center", weight: 900, z: -7 });
      else if (structure.breakable && Number.isFinite(structure.hp)) {
        const ratio = clamp(structure.hp / structure.maxHp, 0, 1);
        layer.rect({ x: x + 4, y: y + 4, width: (structure.width - 8) * ratio, height: 3, color: COLORS.gold, z: -7 });
      }
    }
  }

  drawMission(layer, combat, ox, oy) {
    const mission = combat.mission;
    if (!mission) return;
    if (mission.id === "coaster") {
      const topWidth = mission.laneWidth * 0.18;
      const bottomWidth = mission.laneWidth;
      layer.line({ x1: mission.laneX - topWidth / 2 + ox, y1: 110 + oy, x2: mission.laneX - bottomWidth / 2 + ox, y2: this.height - 110 + oy, width: 5, color: "#23a8d1", opacity: 0.8, z: -4 });
      layer.line({ x1: mission.laneX + topWidth / 2 + ox, y1: 110 + oy, x2: mission.laneX + bottomWidth / 2 + ox, y2: this.height - 110 + oy, width: 5, color: "#23a8d1", opacity: 0.8, z: -4 });
      for (let index = 0; index < 8; index += 1) {
        const y = 130 + ((index * 92 + combat.elapsed * 180 * mission.trackSpeed) % Math.max(180, this.height - 210));
        const ratio = (y - 110) / Math.max(1, this.height - 220);
        const half = topWidth / 2 + (bottomWidth / 2 - topWidth / 2) * ratio;
        layer.line({ x1: mission.laneX - half + ox, y1: y + oy, x2: mission.laneX + half + ox, y2: y + oy, width: 2, color: "#ffffff", opacity: 0.58, z: -3 });
      }
    } else if (mission.id === "rings") {
      layer.circle({ x: mission.ring.x + ox, y: mission.ring.y + oy, radius: mission.ring.radius, color: "#ffffff", opacity: 0.06, border: "#efb632", z: 2 });
      layer.circle({ x: mission.ring.x + ox, y: mission.ring.y + oy, radius: mission.ring.radius * 0.74, color: "#ffffff", opacity: 0, border: "#fff3a8", z: 3 });
    } else if (mission.id === "carrier") {
      const carrier = mission.carrier;
      layer.rect({ x: carrier.x - carrier.width / 2 + ox, y: carrier.y - carrier.height / 2 + oy, width: carrier.width, height: carrier.height, color: "#536873", border: "#1c3039", z: -3 });
      layer.rect({ x: carrier.x - carrier.deckWidth / 2 + ox, y: carrier.y - carrier.deckHeight / 2 + oy, width: carrier.deckWidth, height: carrier.deckHeight, color: "#e1b84e", opacity: 0.6, border: "#fff1ad", z: -2 });
      layer.text("航母甲板", { x: carrier.x - carrier.deckWidth / 2 + ox, y: carrier.y - 10 + oy, width: carrier.deckWidth, height: 20, color: "#172731", fontSize: 9, align: "center", weight: 900, z: -1 });
    } else if (mission.id === "mothership") {
      layer.rect({ x: this.width * 0.08 + ox, y: this.height * 0.14 + oy, width: this.width * 0.84, height: 130, color: "#354d5a", border: "#12232b", z: -2 });
      mission.parts.forEach((part) => {
        layer.circle({ x: part.x + ox, y: part.y + oy, radius: part.radius, color: part.destroyed ? "#403e3b" : "#c47b22", opacity: part.destroyed ? 0.45 : 0.9, border: "#fff0b5", z: 1 });
        if (!part.destroyed) layer.rect({ x: part.x - part.radius + ox, y: part.y + part.radius + 5 + oy, width: part.radius * 2 * clamp(part.health / part.maxHealth, 0, 1), height: 4, color: "#efb632", z: 2 });
      });
    } else if (mission.id === "chain") {
      mission.nodes.forEach((node) => {
        if (node.destroyed) return;
        layer.circle({ x: node.x + ox, y: node.y + oy, radius: node.radius, color: "#d65346", border: "#ffce74", z: 2 });
      });
    }
  }

  drawAirdrop(layer, combat, ox, oy) {
    const drop = combat.airdrop;
    if (!drop) return;
    if (drop.phase === "carrier") {
      const carrier = drop.carrier;
      this.drawAircraft(layer, carrier.x + ox, carrier.y + oy, carrier.radius, "#2f8f6b", "carrier", 2);
      layer.rect({ x: carrier.x - 30 + ox, y: carrier.y + 32 + oy, width: 60 * clamp(carrier.health / carrier.maxHealth, 0, 1), height: 4, color: "#2f8f6b", z: 3 });
    } else if (drop.crate) {
      const crate = drop.crate;
      if (drop.phase === "escort") layer.circle({ x: crate.x + ox, y: crate.y + oy, radius: crate.escortRadius, color: "#2f8f6b", opacity: 0.08, border: "#2f8f6b", z: -1 });
      layer.rect({ x: crate.x - 20 + ox, y: crate.y - 18 + oy, width: 40, height: 36, color: drop.upgraded ? "#efb632" : "#2f8f6b", border: "#172731", z: 2 });
      if (drop.phase === "escort") {
        layer.rect({ x: crate.x - 34 + ox, y: crate.y + 25 + oy, width: 68, height: 5, color: "#d7decf", z: 2 });
        layer.rect({ x: crate.x - 34 + ox, y: crate.y + 25 + oy, width: 68 * clamp(crate.escortTime / 6, 0, 1), height: 5, color: "#2f8f6b", z: 3 });
      }
    }
  }

  drawMeteors(layer, combat, ox, oy) {
    combat.entities.meteorWarnings.forEach((warning) => {
      const pulse = 0.65 + Math.sin(this.time * 12) * 0.2;
      layer.circle({ x: warning.x + ox, y: warning.y + oy, radius: warning.radius * pulse, color: "#c84f45", opacity: 0.08, border: "#c84f45", z: -1 });
      layer.text(warning.large ? "大型陨石" : "落点预警", { x: warning.x - 52 + ox, y: warning.y - 10 + oy, width: 104, height: 20, color: "#8d2d29", fontSize: 9, align: "center", weight: 900, z: 1 });
    });
    combat.entities.meteors.forEach((meteor) => {
      layer.circle({ x: meteor.x + ox, y: meteor.y + oy, radius: meteor.radius, color: meteor.color, border: "#3c2926", z: 2 });
      layer.circle({ x: meteor.x - meteor.radius * 0.2 + ox, y: meteor.y - meteor.radius * 0.15 + oy, radius: meteor.radius * 0.22, color: "#d99b68", opacity: 0.65, z: 3 });
    });
  }

  drawProjectiles(layer, combat, ox, oy) {
    combat.entities.playerProjectiles.forEach((bullet) => {
      if (["rail", "heavy"].includes(bullet.type)) layer.line({ x1: bullet.x + ox, y1: bullet.y + 12 + oy, x2: bullet.x + ox, y2: bullet.y - 14 + oy, width: bullet.radius * 1.2, color: bullet.color, z: 4 });
      else {
        layer.line({ x1: bullet.x + ox, y1: bullet.y + 9 + oy, x2: bullet.x + ox, y2: bullet.y - 7 + oy, width: Math.max(2, bullet.radius * 0.62), color: bullet.color, opacity: 0.7, z: 4 });
        layer.circle({ x: bullet.x + ox, y: bullet.y - 5 + oy, radius: Math.max(2.4, bullet.radius * 0.76), color: "#dffaff", border: bullet.color, z: 5 });
      }
    });
    combat.entities.enemyProjectiles.forEach((bullet) => {
      const x = bullet.x + ox;
      const y = bullet.y + oy;
      if (bullet.kind === "needle") layer.line({ x1: x, y1: y - 10, x2: x, y2: y + 13, width: Math.max(2.5, bullet.radius), color: bullet.color, z: 4 });
      else if (bullet.kind === "mine") {
        layer.circle({ x, y, radius: bullet.radius + 5, color: bullet.color, opacity: 0.08, border: "#ffd27a", z: 3 });
        layer.circle({ x, y, radius: bullet.radius, color: bullet.color, border: "#fff0b5", z: 4 });
      } else if (bullet.kind === "ring") {
        layer.circle({ x, y, radius: bullet.radius + 2, color: bullet.color, opacity: 0.04, border: bullet.color, z: 4 });
      } else if (bullet.kind === "rocket") {
        layer.line({ x1: x, y1: y - 8, x2: x, y2: y + 13, width: bullet.radius * 0.9, color: bullet.color, z: 4 });
        layer.line({ x1: x, y1: y - 13, x2: x, y2: y - 3, width: 2.5, color: "#ffd36a", z: 5 });
      } else {
        layer.polygon({
          points: [
            { x, y: y - bullet.radius * 1.2 },
            { x: x + bullet.radius, y },
            { x, y: y + bullet.radius * 1.2 },
            { x: x - bullet.radius, y },
          ],
          color: bullet.color,
          border: "#ffc0a6",
          z: 4,
        });
      }
    });
    combat.laserBeams.forEach((beam) => {
      const originX = combat.player.x + beam.offsetX + ox;
      const originY = combat.player.y - 24 + oy;
      const endX = originX + Math.sin(beam.angle) * this.height;
      const endY = originY - Math.cos(beam.angle) * this.height;
      layer.line({ x1: originX, y1: originY, x2: endX, y2: endY, width: beam.width * 2.4, color: "#ffffff", opacity: 0.5, z: 5 });
      layer.line({ x1: originX, y1: originY, x2: endX, y2: endY, width: beam.width, color: beam.color, z: 6 });
      if (beam.reflect) layer.line({ x1: endX, y1: endY, x2: this.width - endX, y2: this.height * 0.18, width: beam.width * 0.8, color: beam.color, opacity: 0.8, z: 6 });
    });
    if (combat.laserWarmup > 0) layer.circle({ x: combat.player.x + ox, y: combat.player.y - 28 + oy, radius: 8 + Math.sin(this.time * 22) * 3, color: "#ffffff", border: FIGHTERS[this.state.fighterId].accent, z: 7 });
  }

  drawEnemies(layer, combat, ox, oy) {
    combat.entities.enemies.forEach((enemy) => this.drawAircraft(layer, enemy.x + ox, enemy.y + oy, enemy.radius, enemy.hitFlash > 0 ? "#ffffff" : enemy.color, enemy.type, 2));
  }

  drawAircraft(layer, x, y, radius, color, type, z) {
    if (type === "helicopter") {
      layer.polygon({
        points: [
          { x: x - radius * 0.58, y: y - radius * 0.52 },
          { x: x + radius * 0.38, y: y - radius * 0.52 },
          { x: x + radius * 0.66, y: y - radius * 0.12 },
          { x: x + radius * 0.25, y: y + radius * 0.48 },
          { x: x - radius * 0.54, y: y + radius * 0.38 },
          { x: x - radius * 0.78, y: y },
        ],
        color,
        border: "#d4f3e0",
        z,
      });
      layer.line({ x1: x - radius * 1.25, y1: y - radius * 0.72, x2: x + radius * 1.25, y2: y - radius * 0.72, width: 3, color: "#d4f3e0", opacity: 0.8, z: z + 1 });
      layer.line({ x1: x + radius * 0.38, y1: y + radius * 0.18, x2: x + radius * 1.18, y2: y + radius * 0.62, width: 5, color, z: z + 1 });
      layer.circle({ x: x - radius * 0.12, y: y - radius * 0.12, radius: radius * 0.2, color: "#88d7e7", z: z + 2 });
      return;
    }
    const wide = type === "bomber" || type === "elite" || type === "carrier" || type === "splitter";
    const narrow = type === "sniper" || type === "fighter" || type === "scout";
    const span = wide ? 1.36 : narrow ? 0.94 : 1.12;
    const tail = type === "sniper" ? 1.28 : type === "bomber" ? 0.82 : 1;
    const points = [
      { x, y: y - radius * 1.22 * tail },
      { x: x + radius * 0.26, y: y - radius * 0.44 },
      { x: x + radius * span, y: y + radius * 0.08 },
      { x: x + radius * 0.42, y: y + radius * 0.28 },
      { x: x + radius * 0.34, y: y + radius * 0.98 },
      { x, y: y + radius * 0.68 },
      { x: x - radius * 0.34, y: y + radius * 0.98 },
      { x: x - radius * 0.42, y: y + radius * 0.28 },
      { x: x - radius * span, y: y + radius * 0.08 },
      { x: x - radius * 0.26, y: y - radius * 0.44 },
    ];
    layer.polygon({ points, color, border: type === "elite" ? "#ffd36a" : "#f3c8b4", z });
    layer.line({ x1: x, y1: y - radius * 0.72, x2: x, y2: y + radius * 0.54, width: Math.max(2, radius * 0.12), color: "#f7d7c4", opacity: 0.42, z: z + 1 });
    if (type === "spinner") {
      layer.line({ x1: x - radius * 0.88, y1: y - radius * 0.12, x2: x + radius * 0.88, y2: y + radius * 0.12, width: 3, color: "#ffe29a", z: z + 2 });
    }
    layer.circle({ x, y: y - radius * 0.18, radius: Math.max(3.2, radius * 0.22), color: type === "sniper" ? "#63d8ff" : "#ffd36a", border: COLORS.battleInk, z: z + 2 });
  }

  drawBoss(layer, combat, ox, oy) {
    const boss = combat.boss;
    if (!boss) {
      const effect = combat.bossDefeatFx;
      if (!effect) return;
      const opacity = clamp(effect.timer / 0.36, 0, 1);
      layer.rect({ x: effect.x - 78 + ox, y: effect.y - 42 + oy, width: 156, height: 84, color: "#9e2f35", opacity: opacity * 0.65, border: "#fff0b5", z: 1 });
      layer.circle({ x: effect.x + ox, y: effect.y + oy, radius: 27 + (1 - opacity) * 22, color: "#ffcc54", opacity: opacity * 0.5, border: "#fff3b0", z: 3 });
      return;
    }
    this.drawAircraft(layer, boss.x + ox, boss.y + oy, 58, boss.phase === 3 ? "#b63f48" : "#4b7183", "elite", 1);
    layer.circle({ x: boss.x + ox, y: boss.y - 12 + oy, radius: 13, color: boss.phase === 3 ? "#ffcc54" : "#50c9e8", border: "#fff3b0", z: 4 });
    for (const [key, part] of Object.entries(boss.parts)) {
      const x = boss.x + (key === "left" ? -55 : 55) + ox;
      layer.circle({ x, y: boss.y + 16 + oy, radius: 20, color: part.destroyed ? "#333b3f" : "#c47b22", border: "#fff0b5", z: 3 });
    }
  }

  drawPickups(layer, combat, ox, oy) {
    combat.entities.pickups.forEach((pickup) => {
      const pulse = 1 + Math.sin(this.time * 6 + pickup.phase) * 0.12;
      layer.circle({ x: pickup.x + ox, y: pickup.y + oy, radius: pickup.radius * pulse, color: pickup.color, border: "#fffaf0", z: 5 });
    });
  }

  drawAllies(layer, combat, fighter, ox, oy) {
    combat.entities.allies.forEach((ally) => {
      this.drawAircraft(layer, ally.x + ox, ally.y + oy, 10, fighter.accent, "fighter", 5);
      if (ally.source === "pickup") layer.rect({ x: ally.x - 12 + ox, y: ally.y + 15 + oy, width: 24 * clamp(ally.health / ally.maxHealth, 0, 1), height: 3, color: COLORS.green, z: 6 });
    });
  }

  drawPlayer(layer, combat, fighter, ox, oy) {
    const player = combat.player;
    const size = combat.transformed ? 1.28 : 1;
    const x = player.x + ox;
    const y = player.y + oy;
    if (combat.barrierTime > 0) {
      layer.circle({ x, y: y - 12, radius: 48 + Math.sin(this.time * 8) * 2, color: "#efb632", opacity: 0.08, border: "#efb632", z: 7 });
      layer.line({ x1: x - 38, y1: y - 30, x2: x, y2: y - 52, width: 5, color: "#efb632", opacity: 0.8, z: 8 });
      layer.line({ x1: x, y1: y - 52, x2: x + 38, y2: y - 30, width: 5, color: "#efb632", opacity: 0.8, z: 8 });
    }
    if (player.shieldCharges > 0) layer.circle({ x, y, radius: 30 * size, color: fighter.accent, opacity: 0.05, border: fighter.accent, z: 7 });
    const wingRatio = clamp((fighter.shape?.wing || 34) / 34, 0.82, 1.38);
    const tailRatio = fighter.rig.profile === "specter" ? 0.7 : fighter.rig.profile === "skirmisher" ? 1.18 : 1;
    const span = 30 * wingRatio * size;
    const length = 29 * size;
    const points = [
      { x, y: y - length },
      { x: x + 7 * size, y: y - 12 * size },
      { x: x + span, y: y + 7 * size },
      { x: x + 12 * size, y: y + 10 * size },
      { x: x + 10 * tailRatio * size, y: y + 27 * size },
      { x, y: y + 20 * size },
      { x: x - 10 * tailRatio * size, y: y + 27 * size },
      { x: x - 12 * size, y: y + 10 * size },
      { x: x - span, y: y + 7 * size },
      { x: x - 7 * size, y: y - 12 * size },
    ];
    layer.line({ x1: x - 7 * size, y1: y + 22 * size, x2: x - 7 * size, y2: y + 38 * size, width: 3.5 * size, color: fighter.accent, opacity: 0.42, z: 7 });
    layer.line({ x1: x + 7 * size, y1: y + 22 * size, x2: x + 7 * size, y2: y + 38 * size, width: 3.5 * size, color: fighter.accent, opacity: 0.42, z: 7 });
    layer.polygon({ points, color: combat.transformed ? fighter.accent : "#a9c7d2", border: fighter.accent, z: 8 });
    layer.line({ x1: x - span * 0.78, y1: y + 5 * size, x2: x + span * 0.78, y2: y + 5 * size, width: 2.6 * size, color: fighter.accent, opacity: 0.82, z: 9 });
    if (fighter.rig.profile === "commander" || fighter.rig.profile === "lancer" || fighter.rig.profile === "dualist") {
      layer.line({ x1: x - 18 * size, y1: y - 8 * size, x2: x - 6 * size, y2: y - 2 * size, width: 3, color: fighter.secondary, z: 10 });
      layer.line({ x1: x + 18 * size, y1: y - 8 * size, x2: x + 6 * size, y2: y - 2 * size, width: 3, color: fighter.secondary, z: 10 });
    }
    layer.circle({ x, y: y - 9 * size, radius: 4.8 * size, color: "#dffaff", border: fighter.accent, z: 10 });
    if (combat.transformed) {
      layer.line({ x1: x - span * 0.58, y1: y - 4, x2: x - span * 1.18, y2: y + 30, width: 6, color: fighter.secondary, z: 10 });
      layer.line({ x1: x + span * 0.58, y1: y - 4, x2: x + span * 1.18, y2: y + 30, width: 6, color: fighter.secondary, z: 10 });
      if (fighter.id === "hypersonic" && combat.transformStage === 0) {
        layer.line({ x1: x - 44, y1: y - 18, x2: x - 12, y2: y + 6, width: 5, color: fighter.accent, z: 11 });
        layer.line({ x1: x + 44, y1: y - 18, x2: x + 12, y2: y + 6, width: 5, color: fighter.accent, z: 11 });
      } else if (fighter.id === "hypersonic" && combat.transformStage === 1) {
        layer.circle({ x, y: y - 5, radius: 34, color: fighter.accent, opacity: 0.04, border: fighter.secondary, z: 11 });
        layer.circle({ x, y: y - 5, radius: 22, color: fighter.secondary, opacity: 0.05, border: fighter.accent, z: 12 });
      } else if (fighter.id === "hypersonic" && combat.transformStage === 2) {
        layer.rect({ x: x - 32, y: y - 4, width: 16, height: 30, color: fighter.secondary, border: COLORS.battleInk, z: 11 });
        layer.rect({ x: x + 16, y: y - 4, width: 16, height: 30, color: fighter.secondary, border: COLORS.battleInk, z: 11 });
      } else if (fighter.id === "hypersonic" && combat.transformStage === 3) {
        for (let index = 0; index < 5; index += 1) {
          const angle = -Math.PI * 0.82 + index * Math.PI * 0.16;
          layer.line({ x1: x, y1: y - 16, x2: x + Math.cos(angle) * 52, y2: y - 16 + Math.sin(angle) * 52, width: 4, color: index % 2 ? fighter.secondary : fighter.accent, z: 11 });
        }
      }
    }
  }

  drawParticles(layer, combat, ox, oy) {
    const limit = this.quality === "low" ? 42 : this.quality === "medium" ? 78 : 110;
    combat.entities.particles.slice(0, limit).forEach((particle) => layer.circle({ x: particle.x + ox, y: particle.y + oy, radius: particle.radius, color: particle.color, opacity: clamp(particle.life / particle.maxLife, 0, 1), z: 11 }));
    combat.entities.floatingTexts.forEach((item) => layer.text(item.text, { x: item.x - 40 + ox, y: item.y - 12 + oy, width: 80, height: 24, color: item.color, fontSize: 10, align: "center", weight: 900, z: 13 }));
  }

  drawCombatHud(layer, state, combat, fighter, layout) {
    layer.rect({ ...layout.hud, color: COLORS.battleInk, opacity: 0.82, border: COLORS.line, z: 20 });
    layer.text(`${fighter.country} / ${fighter.shortName}`, { x: layout.hud.x + 9, y: layout.hud.y + 5, width: 92, height: 15, color: fighter.accent, fontSize: 8, weight: 900, z: 21 });
    layer.text(String(Math.round(combat.score)).padStart(6, "0"), { x: layout.hud.x + 9, y: layout.hud.y + 19, width: 90, height: 24, color: COLORS.ink, fontSize: 16, weight: 900, z: 21 });
    layer.text(`连击 ×${combat.combo}`, { x: layout.hud.x + 9, y: layout.hud.y + 41, width: 88, height: 14, color: combat.combo >= 8 ? COLORS.gold : COLORS.soft, fontSize: 8, weight: 900, z: 21 });

    const healthX = layout.hud.x + 101;
    const healthWidth = Math.max(78, layout.pause.x - healthX - 8);
    const healthRatio = clamp(combat.player.health / combat.player.maxHealth, 0, 1);
    layer.text(`耐久 ${Math.ceil(combat.player.health)} / ${combat.player.maxHealth}`, { x: healthX, y: layout.hud.y + 5, width: healthWidth, height: 16, color: healthRatio <= 0.28 ? COLORS.red : COLORS.ink, fontSize: 8, weight: 900, z: 21 });
    layer.rect({ x: healthX, y: layout.hud.y + 23, width: healthWidth, height: 6, color: COLORS.muted, z: 21 });
    layer.rect({ x: healthX, y: layout.hud.y + 23, width: healthWidth * healthRatio, height: 6, color: healthRatio <= 0.28 ? COLORS.red : COLORS.green, z: 22 });
    layer.text(`护盾 ${combat.player.shieldCharges}  ·  核心 ${combat.transformCores}/3`, { x: healthX, y: layout.hud.y + 32, width: healthWidth, height: 14, color: COLORS.soft, fontSize: 8, weight: 800, z: 21 });
    const mode = combat.toolModes[combat.toolModeIndex];
    const marked = combat.entities.enemies.filter((enemy) => enemy.marked).length;
    let passiveStatus = "";
    if (state.fighterId === "hypersonic") passiveStatus = combat.transformed ? `阶段 ${combat.transformStage + 1}/4` : "激光处决";
    else if (state.fighterId === "j20") passiveStatus = "高价值锁定";
    else if (state.fighterId === "j35") passiveStatus = `双线标记 ${marked}`;
    else if (state.fighterId === "faxx") passiveStatus = `僚机复制 ${mode.pattern}`;
    else if (state.fighterId === "f22") passiveStatus = `幽灵标记 ${marked}`;
    else if (state.fighterId === "typhoon") passiveStatus = `贯穿连击 ${combat.stormPierceHits || 0}`;
    else if (state.fighterId === "rafale") passiveStatus = `共振 ${Math.max(0, ...combat.entities.enemies.map((enemy) => enemy.resonance || 0))}/5`;
    else if (state.fighterId === "gripen") passiveStatus = `擦弹 ${combat.grazeCount || 0}/6`;
    else if (state.fighterId === "su57") passiveStatus = `反击 ${combat.counterCharge || 0}/5`;
    const weaponText = mode.pattern === "laser" ? `${mode.name} · 热量 ${Math.round(combat.laserHeat)}%` : `${mode.name} · 武器 LV.${combat.weaponLevel}`;
    layer.text(`${weaponText} · ${passiveStatus}`, { x: healthX, y: layout.hud.y + 44, width: healthWidth, height: 13, color: fighter.accent, fontSize: 7, weight: 900, z: 21 });
    this.button(layer, layout.pause, "暂停", false, "surface", 24, state.uiPress === "pause");

    const labels = {
      form: ["攻击", `${combat.toolModeIndex + 1}/${combat.toolModes.length}`],
      skill: ["技能", combat.skillCooldown > 0 ? combat.skillCooldown.toFixed(1) : "就绪"],
      transform: [combat.transformed ? "强袭" : "变身", combat.transformed ? combat.transformTime.toFixed(1) : `${combat.transformCores}/3`],
      wingman: ["僚机", combat.wingmanTime > 0 ? combat.wingmanTime.toFixed(1) : combat.wingmanCooldown > 0 ? combat.wingmanCooldown.toFixed(1) : "就绪"],
    };
    Object.values(layout.actions).forEach((rect) => {
      const active = rect.id === "transform" && (combat.transformed || combat.transformCores >= 3);
      this.actionButton(layer, rect, labels[rect.id], {
        active,
        primary: rect.id === "skill",
        pressed: state.uiPress === rect.id,
        accent: fighter.accent,
      });
    });

    if (combat.boss) {
      const width = Math.min(this.width - 34, 380);
      const x = (this.width - width) / 2;
      const y = layout.hud.y + layout.hud.height + 8;
      layer.rect({ x, y, width, height: 38, color: COLORS.battleInk, opacity: 0.94, border: "#874c51", z: 20 });
      layer.text(`${combat.boss.name} · 阶段 ${combat.boss.phase}`, { x: x + 8, y: y + 3, width: width - 16, height: 16, color: COLORS.ink, fontSize: 8, align: "center", weight: 900, z: 21 });
      layer.rect({ x: x + 12, y: y + 23, width: width - 24, height: 6, color: "#6f3836", z: 21 });
      layer.rect({ x: x + 12, y: y + 23, width: (width - 24) * clamp(combat.boss.health / combat.boss.maxHealth, 0, 1), height: 6, color: "#ef6b55", z: 22 });
    }

    if (combat.mission) {
      const mission = combat.mission;
      const spec = MINI_MISSIONS[mission.id];
      const width = Math.min(this.width - 34, 360);
      const x = (this.width - width) / 2;
      const y = layout.hud.y + layout.hud.height + (combat.boss ? 52 : 8);
      const progressText = mission.id === "coaster" ? `${mission.onTrack.toFixed(1)} / 8.5 秒`
        : mission.id === "rings" ? `${mission.passed} / 5 环`
          : mission.id === "carrier" ? `${mission.dockTime.toFixed(1)} / 2.0 秒`
            : mission.id === "mothership" ? `${mission.parts.filter((part) => part.destroyed).length} / 3 部件`
              : `${mission.chainMax} 连爆`;
      layer.rect({ x, y, width, height: 46, color: COLORS.battleInk, opacity: 0.94, border: COLORS.line, z: 20 });
      layer.text(`${spec.title} · ${progressText}`, { x: x + 8, y: y + 5, width: width - 70, height: 18, color: COLORS.gold, fontSize: 9, weight: 900, z: 21 });
      layer.text(`${mission.timer.toFixed(1)} 秒`, { x: x + width - 66, y: y + 5, width: 58, height: 18, color: COLORS.red, fontSize: 9, align: "right", weight: 900, z: 21 });
      layer.text(mission.id === "coaster" ? mission.segmentLabel : spec.objective, { x: x + 8, y: y + 25, width: width - 16, height: 16, color: COLORS.soft, fontSize: 8, weight: 700, z: 21 });
    }

    if (combat.airdrop?.phase === "escort") {
      const crate = combat.airdrop.crate;
      layer.text(`空投护送 ${crate.escortTime.toFixed(1)} / 6.0 秒 · 完整度 ${Math.ceil(crate.health / crate.maxHealth * 100)}%`, { x: 12, y: this.height - 154, width: this.width - 24, height: 24, color: COLORS.green, fontSize: 10, align: "center", weight: 900, z: 21 });
    }
  }

  drawCombatFeedback(layer, state, combat) {
    if (combat.player.health / combat.player.maxHealth <= 0.28) {
      const opacity = 0.18 + (Math.sin(this.time * 7) + 1) * 0.08;
      layer.rect({ x: 0, y: 0, width: 8, height: this.height, color: "#d53d35", opacity, z: 30 });
      layer.rect({ x: this.width - 8, y: 0, width: 8, height: this.height, color: "#d53d35", opacity, z: 30 });
    }
    if (combat.flash > 0) {
      const flashScale = state.settings.effects === "reduced" ? 0.35 : 1;
      layer.rect({ x: 0, y: 0, width: this.width, height: this.height, color: "#ffffff", opacity: clamp(combat.flash * flashScale, 0, 0.72), z: 31 });
    }
    if (combat.notice) {
      const width = Math.min(this.width - 36, 330);
      const x = (this.width - width) / 2;
      const y = Math.max(160, this.height * 0.28);
      layer.rect({ x, y, width, height: 56, color: COLORS.battleInk, opacity: 0.92, border: COLORS.line, z: 28 });
      layer.text(combat.notice.title, { x: x + 10, y: y + 7, width: width - 20, height: 20, color: "#efb632", fontSize: 10, align: "center", weight: 900, z: 29 });
      layer.text(combat.notice.text, { x: x + 10, y: y + 29, width: width - 20, height: 20, color: COLORS.ink, fontSize: 9, align: "center", weight: 800, z: 29 });
    }
    if (!combat.transformed && combat.transformCores >= 3) {
      const width = Math.min(this.width - 28, 360);
      layer.rect({ x: (this.width - width) / 2, y: this.height * 0.66, width, height: 58, color: "#8d3e24", opacity: 0.96, border: COLORS.gold, z: 27 });
      layer.text("能量已满，点击右侧“变身”", { x: (this.width - width) / 2 + 8, y: this.height * 0.66 + 9, width: width - 16, height: 38, color: "#ffffff", fontSize: 15, align: "center", weight: 900, z: 28 });
    }
    if (combat.nuclear) {
      layer.circle({ x: combat.nuclear.x, y: combat.nuclear.y, radius: 38 + Math.sin(this.time * 14) * 8, color: "#efb632", opacity: 0.16, border: "#d53d35", z: 26 });
      layer.text(`核裁决 ${combat.nuclear.timer.toFixed(1)}`, { x: 0, y: this.height * 0.42, width: this.width, height: 42, color: COLORS.red, fontSize: 20, align: "center", weight: 900, z: 28 });
    }
  }

  drawToast(state, y) {
    if (!state.toast) return;
    const width = Math.min(this.width - 32, 340);
    this.uiLayer.rect({ x: (this.width - width) / 2, y, width, height: 38, color: COLORS.battleInk, opacity: 0.92, border: COLORS.line, z: 40 });
    this.uiLayer.text(state.toast.text, { x: (this.width - width) / 2 + 8, y: y + 4, width: width - 16, height: 30, color: COLORS.ink, fontSize: 10, align: "center", weight: 800, z: 41 });
  }

  drawHangarGuide(state, layout, fighter) {
    const stage = state.hangar.guideStage;
    if (stage >= 3 || state.modal) return;
    const messages = [
      "左右滑动，挑选你的战机",
      "试试四种预览，了解战机能力",
      "选择战区，然后驾驶出击",
    ];
    const message = messages[stage] || messages[0];
    const width = Math.min(this.width - 48, 280);
    const x = (this.width - width) / 2;
    layerGuide(this.uiLayer, { x, y: layout.preview.y + 8, width, text: message, accent: fighter.accent });
  }

  button(layer, rect, label, active = false, kind = "default", z = 24, pressed = false, accent = null) {
    const primary = kind === "primary" || active;
    const surface = kind === "surface";
    const drawRect = pressed ? { ...rect, x: rect.x + 2, y: rect.y + 2, width: rect.width - 4, height: rect.height - 4 } : rect;
    const primaryColor = accent || COLORS.blue;
    layer.rect({ ...drawRect, color: primary ? primaryColor : surface ? COLORS.surface : COLORS.muted, border: primary ? primaryColor : COLORS.line, z });
    const lines = String(label).split("\n");
    lines.forEach((line, index) => layer.text(line, {
      x: drawRect.x + 4,
      y: drawRect.y + (lines.length === 1 ? 4 : 6 + index * (drawRect.height - 14) / lines.length),
      width: drawRect.width - 8,
      height: lines.length === 1 ? drawRect.height - 8 : (drawRect.height - 14) / lines.length,
      color: primary ? COLORS.battleInk : COLORS.ink,
      fontSize: Math.min(lines.length === 1 ? 13 : 9, drawRect.height * 0.27),
      align: "center",
      weight: 900,
      z: z + 1,
    }));
  }

  actionButton(layer, rect, [title, status], { active = false, primary = false, pressed = false, accent = COLORS.blue } = {}) {
    const radius = Math.min(rect.width, rect.height) * (pressed ? 0.45 : 0.49);
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height / 2;
    const fill = active ? COLORS.gold : primary ? accent : COLORS.battleInk;
    const border = active ? "#fff1ac" : primary ? "#d5f7ff" : COLORS.line;
    layer.circle({ x, y, radius, color: fill, opacity: primary || active ? 0.96 : 0.88, border, z: 24 });
    layer.text(title, { x: x - radius, y: y - 18, width: radius * 2, height: 19, color: active || primary ? COLORS.battleInk : COLORS.ink, fontSize: primary ? 13 : 11, align: "center", weight: 900, z: 25 });
    layer.text(status, { x: x - radius, y: y + 2, width: radius * 2, height: 16, color: active || primary ? COLORS.battleInk : COLORS.soft, fontSize: 8, align: "center", weight: 800, z: 25 });
  }

  drawModal(modal) {
    if (modal.type === "map") {
      this.drawMapModal(modal);
      return;
    }
    const layer = this.uiLayer;
    layer.rect({ x: 0, y: 0, width: this.width, height: this.height, color: COLORS.paper, opacity: 0.72, z: 50 });
    const width = Math.min(this.width - 32, 420);
    const height = Math.min(this.height - 80, modal.height || 330);
    const x = (this.width - width) / 2;
    const y = (this.height - height) / 2;
    layer.rect({ x, y, width, height, color: COLORS.surface, border: COLORS.line, z: 51 });
    layer.text(modal.title, { x: x + 18, y: y + 18, width: width - 36, height: 38, color: COLORS.ink, fontSize: 22, weight: 900, z: 52 });
    const lines = (modal.lines || []).flatMap((line) => wrapLine(line, width < 370 ? 23 : 28));
    lines.forEach((line, index) => layer.text(line, { x: x + 18, y: y + 66 + index * 24, width: width - 36, height: 22, color: COLORS.soft, fontSize: 10, weight: 650, z: 52 }));
    if (modal.type === "loading") {
      const progress = clamp(this.state.hangar.packageProgress, 0, 1);
      layer.rect({ x: x + 18, y: y + 112, width: width - 36, height: 8, color: COLORS.muted, z: 52 });
      layer.rect({ x: x + 18, y: y + 112, width: (width - 36) * progress, height: 8, color: FIGHTERS[this.state.fighterId].accent, z: 53 });
      layer.text(`${Math.round(progress * 100)}%`, { x: x + 18, y: y + 124, width: width - 36, height: 20, color: COLORS.soft, fontSize: 9, align: "center", weight: 800, z: 53 });
    }
    if (modal.options) {
      const optionHeight = 44;
      const gap = 10;
      const total = modal.options.length * optionHeight + Math.max(0, modal.options.length - 1) * gap;
      const startY = y + height - 18 - total;
      modal.optionRects = modal.options.map((option, index) => {
        const rect = { x: x + 18, y: startY + index * (optionHeight + gap), width: width - 36, height: optionHeight, id: option.id };
        this.button(layer, rect, option.label, index === 0, index === 0 ? "primary" : "default", 52);
        return rect;
      });
    }
  }

  drawMapModal(modal) {
    const layer = this.uiLayer;
    layer.rect({ x: 0, y: 0, width: this.width, height: this.height, color: COLORS.paper, opacity: 0.76, z: 50 });
    const width = Math.min(this.width - 24, 430);
    const height = Math.min(this.height - 44, modal.height || 520);
    const x = (this.width - width) / 2;
    const y = (this.height - height) / 2;
    layer.rect({ x, y, width, height, color: COLORS.surface, border: COLORS.line, z: 51 });
    layer.text("选择作战地图", { x: x + 16, y: y + 14, width: width - 82, height: 34, color: COLORS.ink, fontSize: 20, weight: 900, z: 52 });
    const close = { id: "close", x: x + width - 58, y: y + 10, width: 44, height: 44 };
    this.button(layer, close, "关闭", false, "surface", 52);
    const gap = 7;
    const top = y + 58;
    const cardHeight = Math.max(54, Math.min(70, (height - 74 - gap * 4) / 5));
    const mapRects = (modal.maps || []).map((entry, index) => {
      const map = BATTLE_MAPS[entry.id];
      const selected = entry.id === this.state.mapId;
      const rect = { id: `map:${entry.id}`, x: x + 14, y: top + index * (cardHeight + gap), width: width - 28, height: cardHeight };
      layer.rect({ ...rect, color: selected ? COLORS.surfaceStrong : COLORS.muted, opacity: selected ? 1 : 0.72, border: selected ? map.accent : COLORS.line, z: 52 });
      layer.rect({ x: rect.x, y: rect.y, width: 4, height: rect.height, color: map.accent, z: 53 });
      layer.text(map.name, { x: rect.x + 12, y: rect.y + 5, width: rect.width - 112, height: 22, color: COLORS.ink, fontSize: 12, weight: 900, z: 53 });
      layer.text(map.feature, { x: rect.x + 12, y: rect.y + 28, width: rect.width - 24, height: 18, color: COLORS.soft, fontSize: 8, weight: 750, z: 53 });
      const status = selected ? "当前战区" : entry.status === "ready" ? "已缓存" : entry.status === "loading" ? "加载中" : "需装载";
      layer.text(status, { x: rect.x + rect.width - 96, y: rect.y + 6, width: 84, height: 20, color: selected ? map.accent : COLORS.soft, fontSize: 8, align: "right", weight: 900, z: 53 });
      return rect;
    });
    modal.optionRects = [close, ...mapRects];
  }

  dispose() {
    if (this.currentModel) this.currentModel.traverse((item) => {
      item.geometry?.dispose?.();
      item.material?.dispose?.();
    });
    this.renderer.dispose();
  }
}
