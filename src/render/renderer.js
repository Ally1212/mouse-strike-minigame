import * as THREE from "three-platformize";
import { BATTLE_MAPS } from "../content/battle-maps.js";
import { battleVisual, environmentDensity } from "../content/battle-visuals.js";
import { fighterCombatScale, fighterSilhouetteGeometry, fighterWeaponHardpointKeys } from "../content/fighter-geometry.js";
import { fighterAbility } from "../content/fighter-abilities.js";
import { FIGHTER_ORDER, FIGHTERS } from "../content/fighter-profiles.js";
import { MINI_MISSIONS } from "../content/mini-missions.js";
import { battleCadence } from "../content/gameplay-rules.js";
import { normalizeWeaponIndex, weaponMetrics } from "../content/weapon-metrics.js";
import { computeCombatLayout, computeHangarLayout } from "../ui/layout.js";
import { createFighterModel, updateFighterModel } from "./fighter-model.js";
import { ImmediateLayer } from "./immediate-layer.js";
import { weaponPreviewFrame } from "./weapon-preview.js";

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

export const COMPAT_LIGHT_SCALE = 0.18;

export function configureRendererColorPipeline(renderer) {
  renderer.outputEncoding = THREE.LinearEncoding;
  renderer.toneMapping = THREE.NoToneMapping;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function lightenHex(hex, amount = 0) {
  const value = Number.parseInt(String(hex).replace("#", ""), 16);
  const mix = (channel) => Math.round(channel + (255 - channel) * clamp(amount, 0, 1));
  return `#${[value >> 16, (value >> 8) & 255, value & 255].map((channel) => mix(channel).toString(16).padStart(2, "0")).join("")}`;
}

function darkenHex(hex, amount = 0) {
  const value = Number.parseInt(String(hex).replace("#", ""), 16);
  const mix = (channel) => Math.round(channel * (1 - clamp(amount, 0, 1)));
  return `#${[value >> 16, (value >> 8) & 255, value & 255].map((channel) => mix(channel).toString(16).padStart(2, "0")).join("")}`;
}

export function colorLuminance(hex) {
  const value = Number.parseInt(String(hex).replace("#", ""), 16);
  const channels = [value >> 16, (value >> 8) & 255, value & 255].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function fighterPaintPalette(bodyColor, transformed = false, accent = "#39cdf3") {
  if (transformed) return { body: accent, upper: lightenHex(accent, 0.1), wing: lightenHex(accent, 0.05), panel: darkenHex(accent, 0.48) };
  const luminance = colorLuminance(bodyColor);
  const upperLift = luminance > 0.24 ? 0.055 : luminance > 0.14 ? 0.09 : 0.14;
  return {
    body: bodyColor,
    upper: lightenHex(bodyColor, upperLift),
    wing: lightenHex(bodyColor, upperLift * 0.72),
    panel: luminance > 0.2 ? darkenHex(bodyColor, 0.42) : lightenHex(bodyColor, 0.42),
  };
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
    configureRendererColorPipeline(this.renderer);
    this.renderer.shadowMap.enabled = state.settings.quality === "high";
    this.uiScene = new THREE.Scene();
    this.uiCamera = new THREE.OrthographicCamera(0, this.width, this.height, 0, 0.1, 200);
    this.uiCamera.position.z = 100;
    this.uiLayer = new ImmediateLayer(runtime);
    this.uiScene.add(this.uiLayer.group);
    this.hudScene = new THREE.Scene();
    this.hudLayer = new ImmediateLayer(runtime);
    this.hudScene.add(this.hudLayer.group);
    this.combatScene = new THREE.Scene();
    this.combatCamera = new THREE.OrthographicCamera(-this.width / 2, this.width / 2, this.height / 2, -this.height / 2, 0.1, 1000);
    this.combatCamera.position.set(0, 500, 0);
    this.combatCamera.up.set(0, 0, -1);
    this.combatCamera.lookAt(0, 0, 0);
    this.combatRoot = new THREE.Group();
    this.combatScene.add(this.combatRoot);
    this.combatScene.add(new THREE.HemisphereLight(0xbcecff, 0x07131b, 2.2 * COMPAT_LIGHT_SCALE));
    const combatKey = new THREE.DirectionalLight(0xeefaff, 3.4 * COMPAT_LIGHT_SCALE);
    combatKey.position.set(-140, 260, 90);
    this.combatScene.add(combatKey);
    const combatRim = new THREE.DirectionalLight(0x4bcdf4, 1.8 * COMPAT_LIGHT_SCALE);
    combatRim.position.set(130, 160, -120);
    this.combatScene.add(combatRim);
    this.combatVisual = { lastX: this.width / 2, bank: 0, pitch: 0 };
    this.hangarScene = new THREE.Scene();
    this.hangarScene.background = new THREE.Color(COLORS.paper);
    this.hangarCamera = new THREE.PerspectiveCamera(38, this.width / this.height, 0.1, 2000);
    this.hangarCamera.position.set(0, 128, 390);
    this.hangarCamera.lookAt(0, 0, 0);
    this.hangarRoot = new THREE.Group();
    this.hangarScene.add(this.hangarRoot);
    this.hangarScene.add(new THREE.HemisphereLight(0xa8eaff, 0x07111a, 2.5 * COMPAT_LIGHT_SCALE));
    const key = new THREE.DirectionalLight(0xeefaff, 4.4 * COMPAT_LIGHT_SCALE);
    key.position.set(-120, 170, 130);
    key.castShadow = true;
    this.hangarScene.add(key);
    const fill = new THREE.DirectionalLight(0x53d8ff, 2.6 * COMPAT_LIGHT_SCALE);
    fill.position.set(120, 40, 120);
    this.hangarScene.add(fill);
    const rim = new THREE.DirectionalLight(0x86dfff, 1.5 * COMPAT_LIGHT_SCALE);
    rim.position.set(80, 90, -140);
    this.hangarScene.add(rim);
    this.transformLight = new THREE.PointLight(0x39cdf3, 0, 260, 1.7);
    this.transformLight.position.set(0, 52, 78);
    this.hangarScene.add(this.transformLight);
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(118, 64),
      new THREE.MeshLambertMaterial({ color: 0x0b2432, emissive: 0x031018, emissiveIntensity: 0.08 }),
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
    this.combatCamera.left = -this.width / 2;
    this.combatCamera.right = this.width / 2;
    this.combatCamera.top = this.height / 2;
    this.combatCamera.bottom = -this.height / 2;
    this.combatCamera.updateProjectionMatrix();
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
      this.currentModel.parent?.remove(this.currentModel);
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
    this.transformLight.color.copy(accent);
  }

  render(state, delta = 0) {
    this.time += delta;
    this.frameDelta = delta;
    if (state.scene === "hangar" || state.scene === "loading") this.renderHangar(state);
    else this.renderCombat(state);
  }

  renderHangar(state) {
    this.setFighter(state.fighterId);
    if (this.currentModel.parent !== this.hangarRoot) this.hangarRoot.add(this.currentModel);
    updateFighterModel(this.currentModel, state.hangar.previewMode, this.time, state.hangar.modelRotation, state.settings.reducedMotion, this.quality === "low");
    const layout = computeHangarLayout(this.width, this.height, this.runtime.viewport.safeArea, this.runtime.viewport.menuButton);
    const previewCenterY = layout.preview.y + layout.preview.height * 0.46;
    const scale = Math.max(0.48, Math.min(0.68, layout.preview.height / 560));
    const transition = state.settings.reducedMotion ? 0 : state.hangar.transition || 0;
    this.currentModel.scale.setScalar(scale * (FIGHTERS[state.fighterId].rig.cameraScale || 1) * (1 - Math.abs(transition) * 0.055));
    this.currentModel.position.x = transition * 28;
    this.currentModel.position.z = 0;
    this.currentModel.rotation.y += transition * -0.16;
    this.currentModel.visible = state.hangar.previewMode !== "assault";
    this.hangarRoot.position.set(0, (this.height * 0.5 - previewCenterY) * 0.29, 0);
    this.hangarTheme.lerp(this.hangarTargetTheme, Math.min(1, (this.frameDelta || 0.016) * 5));
    this.hangarScene.background.copy(this.hangarTheme);
    const energyPhase = this.currentModel.userData.transformPhase?.energyPhase || 0;
    this.transformLight.intensity = this.quality === "low" ? 0 : energyPhase * (1.35 + Math.sin(this.time * 3.2) * 0.1);
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
    if (state.hangar.previewMode === "transform") this.drawHangarTransformFx(state, layout, fighter);
    layer.line({ x1: layout.pad, y1: layout.preview.y + 4, x2: layout.pad + 46, y2: layout.preview.y + 4, width: 2, color: COLORS.blue, opacity: 0.74, z: 2 });
    layer.line({ x1: this.width - layout.pad - 46, y1: layout.preview.y + 4, x2: this.width - layout.pad, y2: layout.preview.y + 4, width: 2, color: COLORS.blue, opacity: 0.74, z: 2 });
    if (state.hangar.previewMode === "assault") {
      this.drawHangarWeaponDemo(state, layout, fighter);
      this.drawHangarWeaponSelector(state, layout, fighter);
    }
    const previewLabels = { flight: "飞行\n巡航姿态", transform: "变形\n机甲形态", assault: "火力\n强袭演示", tactical: "特性\n专属被动" };
    layout.previewButtons.forEach((button) => this.button(
      layer,
      button,
      previewLabels[button.id],
      state.hangar.previewMode === button.id,
      "surface",
      24,
      state.uiPress === `preview:${button.id}`,
    ));

    this.drawHangarInfo(state, layout, fighter);

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
    this.button(layer, layout.start, "驾驶出击", false, "primary", 24, state.uiPress === "start", fighter.accent);
    this.drawToast(state, layout.preview.y + layout.preview.height - 52);
    if (state.modal) this.drawModal(state.modal);
    layer.end();
  }

  drawHangarWeaponSelector(state, layout, fighter) {
    const layer = this.uiLayer;
    const current = state.hangar.weaponModeIndex || 0;
    const modes = fighter.toolModes;
    layout.weaponCards.forEach((card) => {
      const index = normalizeWeaponIndex(fighter.id, current + card.offset);
      const mode = modes[index];
      const selected = card.offset === 0;
      const pressed = state.uiPress === `weapon:${card.offset}`;
      const rect = pressed ? { ...card, x: card.x + 2, y: card.y + 2, width: card.width - 4, height: card.height - 4 } : card;
      layer.rect({ ...rect, color: selected ? COLORS.surfaceStrong : COLORS.battleInk, opacity: selected ? 0.98 : 0.8, border: selected ? fighter.accent : COLORS.line, z: 8 });
      const marker = card.offset < 0 ? "▲ 上一种" : card.offset > 0 ? "▼ 下一种" : `${index + 1}/${modes.length} 当前`;
      const name = mode.name.replace(/^\d+\s*/, "");
      const lines = wrapLine(name, 6).slice(0, 2).join("\n");
      layer.text(marker, { x: rect.x + 4, y: rect.y + 4, width: rect.width - 8, height: 13, color: selected ? fighter.accent : COLORS.soft, fontSize: 6.5, align: "center", weight: 900, z: 9 });
      layer.text(lines, { x: rect.x + 5, y: rect.y + 20, width: rect.width - 10, height: 32, color: COLORS.ink, fontSize: selected ? 8.2 : 7.5, align: "center", weight: 900, z: 9 });
    });
  }

  drawHangarTransformFx(state, layout, fighter) {
    if (state.settings.reducedMotion || this.quality === "low") return;
    const phases = this.currentModel?.userData?.transformPhase;
    if (!phases) return;
    const layer = this.uiLayer;
    const centerX = this.width / 2;
    const centerY = layout.preview.y + layout.preview.height * 0.48;
    const active = 1 - Math.abs(phases.lockPhase * 2 - 1);
    if (phases.lockPhase < 1) {
      const radius = 42 + phases.wingPhase * 92;
      layer.circle({ x: centerX, y: centerY, radius, color: fighter.accent, opacity: 0.025 + active * 0.055, border: fighter.accent, z: 5 });
    } else {
      const pulse = 1 + Math.sin(this.time * 5) * 0.08;
      layer.circle({ x: centerX, y: centerY - 4, radius: 18 * pulse, color: fighter.accent, opacity: 0.05, border: fighter.secondary, z: 5 });
    }
  }

  drawHangarWeaponDemo(state, layout, fighter) {
    const layer = this.uiLayer;
    const mode = fighter.toolModes[state.hangar.weaponModeIndex || 0];
    const bounds = {
      x: layout.weaponCards[0].x + layout.weaponCards[0].width + 12,
      y: layout.preview.y + 42,
      width: this.width - layout.pad - (layout.weaponCards[0].x + layout.weaponCards[0].width + 12),
      height: layout.previewButtons[0].y - 12 - (layout.preview.y + 42),
    };
    layer.rect({ ...bounds, color: COLORS.battleInk, opacity: 0.17, border: COLORS.line, z: 2 });
    layer.text("WEAPON TEST", { x: bounds.x + 8, y: bounds.y + 6, width: bounds.width - 16, height: 14, color: fighter.accent, fontSize: 6.5, align: "right", weight: 900, opacity: 0.72, z: 4 });
    const plane = this.drawWeaponPreviewAircraft(layer, fighter, bounds);
    const originKeys = fighterWeaponHardpointKeys(mode.pattern, mode.count);
    const origins = originKeys.map((key) => plane.origins[key]).filter(Boolean);
    const elapsed = Math.max(0, this.time - (state.hangar.weaponPreviewStartedAt || 0));
    const frame = weaponPreviewFrame({ mode, elapsed, origins, bounds, reducedMotion: state.settings.reducedMotion });

    frame.targets.forEach((target, index) => {
      const pulse = state.settings.reducedMotion ? 1 : 1 + Math.sin(this.time * 3 + index) * 0.08;
      const radius = (target.kind === "armor" ? 11 : 8) * pulse;
      layer.circle({ x: target.x, y: target.y, radius: radius + 5, color: fighter.accent, opacity: 0.025, border: COLORS.line, z: 4 });
      layer.circle({ x: target.x, y: target.y, radius, color: COLORS.battleInk, opacity: 0.82, border: target.kind === "armor" ? fighter.secondary : fighter.accent, z: 5 });
      layer.line({ x1: target.x - radius * 0.55, y1: target.y, x2: target.x + radius * 0.55, y2: target.y, width: 1, color: fighter.accent, opacity: 0.7, z: 6 });
    });
    if (frame.charge) {
      layer.circle({ x: frame.charge.x, y: frame.charge.y, radius: 5 + frame.charge.progress * 10, color: "#ffffff", opacity: 0.08 + frame.charge.progress * 0.2, border: fighter.accent, z: 9 });
    }
    frame.beams.forEach((beam) => {
      layer.line({ x1: beam.origin.x, y1: beam.origin.y, x2: beam.target.x, y2: beam.target.y, width: beam.width * 2.1, color: "#ffffff", opacity: 0.42, z: 7 });
      layer.line({ x1: beam.origin.x, y1: beam.origin.y, x2: beam.target.x, y2: beam.target.y, width: beam.width, color: beam.index % 2 ? fighter.secondary : fighter.accent, opacity: 0.92, z: 8 });
    });
    frame.drones.forEach((drone) => layer.polygon({
      points: [{ x: drone.x, y: drone.y - 7 }, { x: drone.x + drone.side * 9, y: drone.y + 5 }, { x: drone.x, y: drone.y + 2 }, { x: drone.x - drone.side * 5, y: drone.y + 5 }],
      color: fighter.accent,
      border: fighter.secondary,
      z: 8,
    }));
    frame.projectiles.forEach((bullet) => {
      if (bullet.type === "rail") {
        layer.line({ x1: bullet.origin.x, y1: bullet.origin.y, x2: bullet.end.x, y2: bullet.end.y, width: 1.2, color: fighter.accent, opacity: 0.22, z: 6 });
        layer.line({ x1: bullet.x, y1: bullet.y + 13, x2: bullet.x, y2: bullet.y - 15, width: 3, color: "#ffffff", opacity: 0.92, z: 9 });
      } else if (bullet.type === "wave") {
        layer.circle({ x: bullet.x, y: bullet.y, radius: bullet.radius + 4, color: fighter.accent, opacity: 0.07, border: fighter.secondary, z: 8 });
      } else if (bullet.type === "heavy") {
        layer.circle({ x: bullet.x, y: bullet.y, radius: bullet.radius + 3, color: fighter.accent, opacity: 0.75, border: "#ffffff", z: 9 });
      } else if (bullet.type === "seeker") {
        layer.line({ x1: bullet.x, y1: bullet.y + 10, x2: bullet.x, y2: bullet.y + 22, width: 2.2, color: fighter.secondary, opacity: 0.5, z: 7 });
        layer.polygon({ points: [{ x: bullet.x, y: bullet.y - 7 }, { x: bullet.x + 4, y: bullet.y + 5 }, { x: bullet.x - 4, y: bullet.y + 5 }], color: fighter.accent, border: "#ffffff", z: 9 });
      } else {
        layer.line({ x1: bullet.x, y1: bullet.y + 8, x2: bullet.x, y2: bullet.y - 8, width: Math.max(2.5, bullet.radius * 0.75), color: fighter.accent, z: 9 });
      }
    });
    frame.explosions.forEach((effect) => layer.circle({ x: effect.x, y: effect.y, radius: effect.radius, color: fighter.secondary, opacity: effect.opacity * 0.12, border: fighter.accent, z: 10 }));
  }

  drawWeaponPreviewAircraft(layer, fighter, bounds) {
    const x = bounds.x + bounds.width * 0.5;
    const y = bounds.y + bounds.height * 0.78;
    const scale = Math.max(0.88, Math.min(1.08, bounds.width / 255));
    const geometry = this.drawFighterHull(layer, fighter, x, y, scale, { glow: true, detail: "high", z: 10 });
    return {
      x,
      y,
      origins: geometry.hardpoints,
    };
  }

  drawFighterHull(layer, fighter, x, y, scale = 1, options = {}) {
    const geometry = fighterSilhouetteGeometry(fighter, x, y, scale);
    const z = options.z || 8;
    const span = Math.max(...geometry.outline.map((point) => Math.abs(point.x - x)));
    const detail = options.detail || "medium";
    const transformed = Boolean(options.transformed);
    const paint = fighterPaintPalette(geometry.palette.body, transformed, fighter.accent);
    const bodyColor = paint.body;
    const wingColor = paint.wing;
    if (options.glow) {
      layer.circle({ x, y, radius: span + 18, color: fighter.accent, opacity: 0.035, border: COLORS.line, z: z - 4 });
      layer.circle({ x, y: y - 4 * scale, radius: span * 0.72, color: fighter.accent, opacity: 0.025, z: z - 3 });
    }
    layer.polygon({ points: geometry.outline.map((point) => ({ x: point.x + 2.5 * scale, y: point.y + 4 * scale })), color: "#020c13", opacity: 0.58, z: z - 2 });
    layer.polygon({ points: geometry.outline, color: geometry.palette.underside, border: lightenHex(geometry.palette.underside, 0.28), z: z - 1 });
    geometry.wingPanels.forEach((points, index) => layer.polygon({ points, color: index % 2 ? wingColor : darkenHex(wingColor, 0.055), border: paint.panel, z }));
    layer.polygon({ points: geometry.fuselage, color: bodyColor, border: fighter.accent, z: z + 1 });
    const upperFuselage = geometry.fuselage.map((point) => ({ x: x + (point.x - x) * 0.58, y: y + (point.y - y) * 0.92 }));
    layer.polygon({ points: upperFuselage, color: paint.upper, opacity: 0.9, z: z + 2 });
    geometry.canards.forEach((points) => layer.polygon({ points, color: darkenHex(paint.upper, 0.04), border: paint.panel, z: z + 2 }));
    geometry.tails.forEach((points) => layer.polygon({ points, color: darkenHex(paint.upper, 0.1), border: paint.panel, z: z + 2 }));
    if (detail !== "low") {
      geometry.intakes.forEach((points) => layer.polygon({ points, color: "#06131c", border: fighter.accent, z: z + 3 }));
      geometry.weaponBays.forEach((line) => layer.line({ ...line, width: Math.max(1, scale), color: fighter.accent, opacity: 0.38, z: z + 3 }));
      geometry.panelLines.forEach((line) => layer.line({ ...line, width: Math.max(0.8, scale * 0.9), color: paint.panel, opacity: detail === "high" ? 0.48 : 0.3, z: z + 3 }));
    }
    geometry.engines.forEach((engine) => {
      layer.line({ x1: engine.x, y1: engine.y, x2: engine.x, y2: engine.y + 16 * scale, width: 6 * scale, color: fighter.accent, opacity: 0.12, z: z - 1 });
      layer.line({ x1: engine.x, y1: engine.y, x2: engine.x, y2: engine.y + 13 * scale, width: 2.6 * scale, color: fighter.secondary, opacity: 0.72, z: z + 1 });
      layer.circle({ x: engine.x, y: engine.y, radius: 3.1 * scale, color: "#07131a", border: fighter.accent, z: z + 3 });
      layer.circle({ x: engine.x, y: engine.y, radius: 1.45 * scale, color: fighter.secondary, z: z + 4 });
    });
    layer.line({ ...geometry.spine, width: Math.max(1.2, 1.7 * scale), color: fighter.accent, opacity: 0.42, z: z + 3 });
    const cockpitLength = geometry.cockpit.radius * 2.3;
    layer.polygon({ points: [
      { x, y: geometry.cockpit.y - cockpitLength * 0.62 },
      { x: x + geometry.cockpit.radius * 0.82, y: geometry.cockpit.y },
      { x: x + geometry.cockpit.radius * 0.48, y: geometry.cockpit.y + cockpitLength * 0.55 },
      { x: x - geometry.cockpit.radius * 0.48, y: geometry.cockpit.y + cockpitLength * 0.55 },
      { x: x - geometry.cockpit.radius * 0.82, y: geometry.cockpit.y },
    ], color: "#bfeeff", border: fighter.accent, z: z + 5 });
    layer.line({ x1: x - geometry.cockpit.radius * 0.35, y1: geometry.cockpit.y - cockpitLength * 0.25, x2: x + geometry.cockpit.radius * 0.22, y2: geometry.cockpit.y + cockpitLength * 0.32, width: Math.max(0.8, scale), color: "#ffffff", opacity: 0.72, z: z + 6 });
    return { ...geometry, span };
  }

  projectWeaponHardpoint(key) {
    const point = this.currentModel?.userData?.hardpoints?.[key];
    if (!point) return null;
    this.currentModel.updateMatrixWorld(true);
    const projected = point.getWorldPosition(new THREE.Vector3()).project(this.hangarCamera);
    return { x: (projected.x + 1) * 0.5 * this.width, y: (1 - projected.y) * 0.5 * this.height };
  }

  drawHangarInfo(state, layout, fighter) {
    const layer = this.uiLayer;
    const info = layout.info;
    const mode = state.hangar.previewMode;
    layer.rect({ ...info, color: COLORS.surface, opacity: 0.92, border: COLORS.line, z: 1 });
    layer.rect({ x: info.x, y: info.y, width: 4, height: info.height, color: fighter.accent, z: 2 });
    if (mode === "assault") {
      const metrics = weaponMetrics(fighter.id, state.hangar.weaponModeIndex || 0);
      layer.text(`${metrics.patternLabel} · ${metrics.mode.name}`, { x: info.x + 14, y: info.y + 7, width: info.width - 28, height: 18, color: fighter.accent, fontSize: 9, weight: 900 });
      layer.text(`标准状态 · 武器 LV.3 · 爆发 ${metrics.burstGrade} · 覆盖 ${metrics.coverageGrade} · ${metrics.handling}`, { x: info.x + 14, y: info.y + 27, width: info.width - 28, height: 17, color: COLORS.ink, fontSize: 8, weight: 800 });
      const values = metrics.kind === "laser"
        ? [["总DPS", metrics.dps], ["完整照射", metrics.burstDamage], ["预热", `${metrics.warmup}s`], ["热量", metrics.heat]]
        : [["单发", metrics.damagePerProjectile], ["每轮", metrics.volleyDamage], ["理论DPS", metrics.dps], ["弹速", metrics.speed]];
      this.drawMetricCells(layer, info, values, fighter.accent);
      return;
    }
    if (mode === "transform") {
      layer.text(`变形 · ${fighter.transformation.label}`, { x: info.x + 14, y: info.y + 7, width: info.width - 28, height: 18, color: fighter.accent, fontSize: 9, weight: 900 });
      layer.text(`需要 3 个核心 · 强袭 10 秒 · 变形评分 ${fighter.stats.transform}`, { x: info.x + 14, y: info.y + 27, width: info.width - 28, height: 18, color: COLORS.ink, fontSize: 9, weight: 850 });
      wrapLine(fighter.transformation.summary, this.width < 350 ? 24 : 30).slice(0, 2).forEach((line, index) => layer.text(line, { x: info.x + 14, y: info.y + 49 + index * 17, width: info.width - 28, height: 16, color: COLORS.soft, fontSize: 8, weight: 700 }));
      return;
    }
    if (mode === "tactical") {
      const ability = fighterAbility(fighter.id);
      layer.text(`被动 · ${ability.passive.name}`, { x: info.x + 14, y: info.y + 7, width: info.width - 28, height: 18, color: fighter.accent, fontSize: 9, weight: 900 });
      layer.text(`自动 ${ability.passive.interval.toFixed(1)} 秒 · ${ability.passive.phases.join(" → ")}`, { x: info.x + 14, y: info.y + 27, width: info.width - 28, height: 18, color: COLORS.ink, fontSize: 8, weight: 850 });
      wrapLine(ability.passive.description, this.width < 350 ? 24 : 30).slice(0, 2).forEach((line, index) => layer.text(line, { x: info.x + 14, y: info.y + 49 + index * 17, width: info.width - 28, height: 16, color: COLORS.soft, fontSize: 8, weight: 700 }));
      return;
    }
    layer.text(`${fighter.country} · ${fighter.role}`, { x: info.x + 14, y: info.y + 7, width: info.width - 28, height: 18, color: fighter.accent, fontSize: 9, weight: 900 });
    layer.text(fighter.displayName, { x: info.x + 14, y: info.y + 25, width: info.width - 28, height: 29, color: COLORS.ink, fontSize: info.height < 106 ? 19 : 22, weight: 900 });
    layer.text(`${fighter.passiveName} · 生命 ${fighter.health}`, { x: info.x + 14, y: info.y + 54, width: info.width - 28, height: 16, color: COLORS.soft, fontSize: 8, weight: 800 });
    const blend = state.settings.reducedMotion ? 1 : Math.min(1, (this.frameDelta || 0.016) * 8);
    this.displayStats.mobility += (fighter.stats.mobility - this.displayStats.mobility) * blend;
    this.displayStats.firepower += (fighter.stats.firepower - this.displayStats.firepower) * blend;
    this.displayStats.armor += (fighter.stats.armor - this.displayStats.armor) * blend;
    this.drawMetricCells(layer, info, [["机动", Math.round(this.displayStats.mobility)], ["火力", Math.round(this.displayStats.firepower)], ["装甲", Math.round(this.displayStats.armor)]], fighter.accent);
  }

  drawMetricCells(layer, info, values, accent) {
    const slot = (info.width - 28) / values.length;
    const y = info.y + info.height - 35;
    values.forEach(([label, value], index) => {
      const x = info.x + 14 + index * slot;
      layer.text(label, { x, y, width: slot - 5, height: 13, color: COLORS.soft, fontSize: 7, align: "center", weight: 750 });
      layer.text(String(value), { x, y: y + 13, width: slot - 5, height: 17, color: index === 0 ? accent : COLORS.ink, fontSize: 10, align: "center", weight: 900 });
    });
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
    this.drawSkillEffect(layer, combat, fighter, shakeX, shakeY);
    this.drawEnemies(layer, combat, shakeX, shakeY);
    this.drawBoss(layer, combat, shakeX, shakeY);
    this.drawPickups(layer, combat, shakeX, shakeY);
    this.drawAllies(layer, combat, fighter, shakeX, shakeY);
    this.drawParticles(layer, combat, shakeX, shakeY);
    layer.end();
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.render(this.uiScene, this.uiCamera);
    this.renderCombatFighter(combat, fighter, shakeX, shakeY, state.settings.reducedMotion);
    const hud = this.hudLayer;
    hud.begin();
    this.drawCombatHud(hud, state, combat, fighter, layout);
    this.drawCombatFeedback(hud, state, combat);
    this.drawToast(state, this.height - 150, hud);
    if (state.modal) this.drawModal(state.modal, hud);
    hud.end();
    this.renderer.clearDepth();
    this.renderer.render(this.hudScene, this.uiCamera);
    combat.quality.drawCalls = this.renderer.info.render.calls;
  }

  renderCombatFighter(combat, fighter, ox, oy, reducedMotion = false) {
    this.setFighter(fighter.id);
    if (this.currentModel.parent !== this.combatRoot) this.combatRoot.add(this.currentModel);
    updateFighterModel(this.currentModel, combat.transformed ? "transform" : "flight", this.time, 0, reducedMotion, this.quality === "low");
    const x = combat.player.x + ox;
    const y = combat.player.y + oy;
    const deltaX = x - this.combatVisual.lastX;
    this.combatVisual.lastX = x;
    const response = reducedMotion ? 1 : Math.min(1, (this.frameDelta || 0.016) * 10);
    const targetBank = reducedMotion ? 0 : clamp(-deltaX * 0.025, -0.3, 0.3);
    this.combatVisual.bank += (targetBank - this.combatVisual.bank) * response;
    const targetPitch = reducedMotion ? 0 : clamp(Math.abs(deltaX) * 0.004, 0, 0.09);
    this.combatVisual.pitch += (targetPitch - this.combatVisual.pitch) * response;
    const scale = combat.transformed ? 0.72 : 0.64;
    this.currentModel.scale.setScalar(scale);
    this.currentModel.position.set(x - this.width / 2, 0, y - this.height / 2);
    this.currentModel.rotation.set(-0.06 - this.combatVisual.pitch, 0, this.combatVisual.bank);
    this.currentModel.visible = true;
    this.renderer.clearDepth();
    this.renderer.render(this.combatScene, this.combatCamera);
  }

  drawBattleBackground(layer, map, combat, ox, oy) {
    const visual = battleVisual(map.id);
    layer.rect({ x: 0, y: 0, width: this.width, height: this.height, color: visual.deep, z: -20 });
    layer.rect({ x: 0, y: 0, width: this.width, height: this.height * 0.58, color: visual.sky, opacity: 0.98, z: -19 });
    layer.rect({ x: 0, y: this.height * 0.28, width: this.width, height: this.height * 0.48, color: visual.horizon, opacity: 0.18, z: -18 });
    const farScroll = (combat.elapsed * map.structureSpeed * 0.24) % 260;
    const midScroll = (combat.elapsed * map.structureSpeed * 0.62) % 360;
    const nearScroll = (combat.elapsed * map.structureSpeed * 1.12) % 440;
    this.drawFarTerrain(layer, map.id, visual, farScroll, ox, oy);
    this.drawEnvironmentLandmarks(layer, map.id, visual, midScroll, ox, oy);
    this.drawNearAtmosphere(layer, map.id, visual, nearScroll, ox, oy);
    layer.text(`${map.code}  /  ${map.name}`, { x: 14, y: Math.max(108, this.runtime.viewport.safeArea.top + 76), width: this.width - 28, height: 20, color: visual.streak, fontSize: 7, weight: 900, z: -12 });
    layer.text(`${visual.landmark} · ${visual.mechanic}`, { x: 14, y: Math.max(122, this.runtime.viewport.safeArea.top + 90), width: this.width - 28, height: 18, color: visual.haze, fontSize: 6.5, weight: 750, z: -12 });
  }

  drawFarTerrain(layer, mapId, visual, scroll, ox, oy) {
    const horizonY = this.height * 0.29;
    if (mapId === "pacific") {
      layer.rect({ x: 0, y: horizonY, width: this.width, height: this.height - horizonY, color: "#0a4350", opacity: 0.62, z: -17 });
      for (let index = 0; index < 10; index += 1) {
        const y = horizonY + ((index * 82 + scroll) % (this.height - horizonY + 100));
        const width = 34 + (y / this.height) * 94;
        layer.line({ x1: (index * 79) % this.width - width * 0.5 + ox, y1: y + oy, x2: (index * 79) % this.width + width + ox, y2: y + 5 + oy, width: 2.2, color: visual.streak, opacity: 0.12, z: -16 });
      }
      const wakeY = horizonY + ((scroll * 1.7) % Math.max(180, this.height - horizonY));
      layer.line({ x1: this.width * 0.38 + ox, y1: wakeY + oy, x2: this.width * 0.12 + ox, y2: wakeY + 92 + oy, width: 3, color: "#78bec5", opacity: 0.12, z: -16 });
      layer.line({ x1: this.width * 0.62 + ox, y1: wakeY + oy, x2: this.width * 0.88 + ox, y2: wakeY + 92 + oy, width: 3, color: "#78bec5", opacity: 0.12, z: -16 });
      return;
    }
    if (mapId === "arctic") {
      layer.polygon({ points: [{ x: 0, y: horizonY + 62 }, { x: this.width * 0.2, y: horizonY + 8 }, { x: this.width * 0.38, y: horizonY + 54 }, { x: this.width * 0.66, y: horizonY - 8 }, { x: this.width, y: horizonY + 52 }, { x: this.width, y: this.height }, { x: 0, y: this.height }], color: "#245965", opacity: 0.76, z: -17 });
      for (let index = 0; index < 3; index += 1) {
        const wave = Math.sin(this.time * 0.65 + index) * 26;
        layer.line({ x1: -30, y1: 130 + index * 42 + wave, x2: this.width + 30, y2: 102 + index * 54 - wave, width: 10 - index * 2, color: index % 2 ? "#5be7c1" : "#68baf0", opacity: 0.1, z: -16 });
      }
      for (let index = 0; index < 5; index += 1) {
        const y = horizonY + 110 + ((index * 147 + scroll) % Math.max(220, this.height - horizonY));
        const x = (index * 83) % this.width;
        layer.line({ x1: x - 34 + ox, y1: y - 16 + oy, x2: x + ox, y2: y + oy, width: 2, color: "#8ac8c9", opacity: 0.24, z: -16 });
        layer.line({ x1: x + ox, y1: y + oy, x2: x + 42 + ox, y2: y - 24 + oy, width: 2, color: "#8ac8c9", opacity: 0.2, z: -16 });
      }
      return;
    }
    if (mapId === "meteor-rift") {
      layer.polygon({ points: [{ x: 0, y: 150 }, { x: this.width * 0.23, y: 250 }, { x: this.width * 0.12, y: this.height }, { x: 0, y: this.height }], color: "#251b29", border: "#704452", z: -17 });
      layer.polygon({ points: [{ x: this.width, y: 130 }, { x: this.width * 0.76, y: 270 }, { x: this.width * 0.9, y: this.height }, { x: this.width, y: this.height }], color: "#291b28", border: "#754656", z: -17 });
      layer.line({ x1: this.width * 0.5, y1: horizonY, x2: this.width * 0.54, y2: this.height, width: 18, color: "#d26855", opacity: 0.13, z: -16 });
      return;
    }
    const ground = mapId === "sky-corridor" ? "#153653" : "#183c48";
    layer.polygon({ points: [{ x: 0, y: horizonY + 52 }, { x: this.width * 0.18, y: horizonY + 20 }, { x: this.width * 0.37, y: horizonY + 58 }, { x: this.width * 0.62, y: horizonY + 14 }, { x: this.width, y: horizonY + 58 }, { x: this.width, y: this.height }, { x: 0, y: this.height }], color: ground, opacity: mapId === "sky-corridor" ? 0.42 : 0.78, z: -17 });
    if (mapId === "usa") {
      layer.polygon({ points: [{ x: this.width * 0.47, y: horizonY + 20 }, { x: this.width * 0.53, y: horizonY + 20 }, { x: this.width * 0.72, y: this.height }, { x: this.width * 0.28, y: this.height }], color: "#112b34", opacity: 0.82, border: "#45636b", z: -16 });
      for (let index = 0; index < 7; index += 1) {
        const y = horizonY + 54 + ((index * 116 + scroll) % Math.max(200, this.height - horizonY));
        const perspective = clamp((y - horizonY) / Math.max(1, this.height - horizonY), 0.1, 1);
        layer.line({ x1: this.width * 0.5 - 5 * perspective + ox, y1: y + oy, x2: this.width * 0.5 + 5 * perspective + ox, y2: y + oy, width: 2 + perspective * 3, color: "#d2c58d", opacity: 0.32, z: -15 });
      }
    } else if (mapId === "sky-corridor") {
      layer.line({ x1: this.width * 0.42 + ox, y1: horizonY + oy, x2: this.width * 0.12 + ox, y2: this.height + oy, width: 3, color: "#478ab3", opacity: 0.3, z: -16 });
      layer.line({ x1: this.width * 0.58 + ox, y1: horizonY + oy, x2: this.width * 0.88 + ox, y2: this.height + oy, width: 3, color: "#478ab3", opacity: 0.3, z: -16 });
      for (let index = 0; index < 5; index += 1) {
        const y = horizonY + 65 + ((index * 153 + scroll) % Math.max(240, this.height - horizonY));
        layer.line({ x1: this.width * 0.2 + ox, y1: y + oy, x2: this.width * 0.8 + ox, y2: y + oy, width: 1.5, color: "#6eacd1", opacity: 0.16, z: -16 });
      }
    }
  }

  drawEnvironmentLandmarks(layer, mapId, visual, scroll, ox, oy) {
    const count = environmentDensity(mapId, this.quality);
    for (let index = 0; index < count; index += 1) {
      const lane = ((index * 97 + 31) % 100) / 100;
      const y = 120 + ((index * 173 + scroll) % (this.height + 240));
      const perspective = clamp((y - 80) / Math.max(1, this.height - 80), 0.15, 1);
      const x = this.width * (0.08 + lane * 0.84) + ox;
      const size = (8 + 24 * perspective) * (index % 3 === 0 ? 1.25 : 1);
      if (mapId === "usa") {
        if (index % 3 === 0) {
          layer.circle({ x, y: y + oy, radius: size * 0.48, color: "#112c36", border: visual.haze, opacity: 0.82, z: -15 });
          layer.line({ x1: x, y1: y + oy, x2: x, y2: y + size * 1.25 + oy, width: 2.4, color: "#6f8f95", opacity: 0.7, z: -14 });
          layer.line({ x1: x - size * 0.42, y1: y + oy, x2: x + size * 0.42, y2: y + oy, width: 2, color: visual.haze, opacity: 0.6, z: -14 });
        } else {
          layer.rect({ x: x - size, y: y + oy, width: size * 2, height: size * 0.7, color: "#1a343c", opacity: 0.78, border: "#55727a", z: -15 });
        }
      } else if (mapId === "pacific") {
        if (index % 3 === 0) layer.polygon({ points: [{ x: x - size, y: y + oy }, { x: x + size * 0.85, y: y + oy }, { x: x + size * 0.55, y: y + size * 0.42 + oy }, { x: x - size * 0.72, y: y + size * 0.42 + oy }], color: "#243f48", border: "#7c9ba1", z: -15 });
        else layer.circle({ x, y: y + oy, radius: size * 0.48, color: "#1c5559", opacity: 0.85, border: "#6ba7a5", z: -15 });
      } else if (mapId === "arctic") {
        layer.polygon({ points: [{ x: x - size, y: y + size * 0.55 + oy }, { x: x - size * 0.3, y: y - size * 0.45 + oy }, { x: x + size * 0.22, y: y + size * 0.05 + oy }, { x: x + size, y: y + size * 0.62 + oy }], color: index % 2 ? "#4c8990" : "#39757e", border: "#8cc4c4", z: -15 });
      } else if (mapId === "sky-corridor") {
        layer.rect({ x: x - size, y: y + oy, width: size * 2, height: size * 0.36, color: "#1c4867", opacity: 0.82, border: "#5e9dc6", z: -15 });
        layer.circle({ x, y: y - size * 0.18 + oy, radius: size * 0.18, color: "#56b8df", opacity: 0.24, border: visual.streak, z: -14 });
      } else {
        layer.circle({ x, y: y + oy, radius: size * 0.58, color: "#372834", border: "#8d5a5e", z: -15 });
        layer.circle({ x: x - size * 0.17, y: y - size * 0.12 + oy, radius: size * 0.16, color: "#b45f4f", opacity: 0.42, z: -14 });
      }
    }
  }

  drawNearAtmosphere(layer, mapId, visual, scroll, ox, oy) {
    const bands = this.quality === "low" ? 3 : 5;
    for (let index = 0; index < bands; index += 1) {
      const y = 170 + ((index * 211 + scroll) % Math.max(260, this.height - 110));
      const side = index % 2 ? 1 : -1;
      const x = side > 0 ? this.width * 0.76 : this.width * 0.24;
      const width = 56 + (y / this.height) * 92;
      const cloudColor = mapId === "meteor-rift" ? "#b46b67" : visual.haze;
      layer.circle({ x: x + ox, y: y + oy, radius: width * 0.34, color: cloudColor, opacity: mapId === "pacific" ? 0.035 : 0.026, z: -13 });
      layer.line({ x1: x - width + ox, y1: y + oy, x2: x + width + ox, y2: y + 9 * side + oy, width: 14, color: cloudColor, opacity: 0.028, z: -13 });
    }
    for (let index = 0; index < 4; index += 1) {
      const y = ((index * 223 + scroll * 1.35) % (this.height + 160)) - 80;
      const drift = ((index * 71) % 90) - 45;
      layer.line({ x1: this.width * 0.5 + drift * 0.18 + ox, y1: 104 + oy, x2: this.width * 0.5 + drift * 3.6 + ox, y2: y + oy, width: index % 2 ? 1.5 : 3, color: visual.streak, opacity: index % 2 ? 0.1 : 0.065, z: -12 });
    }
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
      const originY = combat.player.y + (beam.offsetY ?? -24) + oy;
      const endX = originX + Math.sin(beam.angle) * this.height;
      const endY = originY - Math.cos(beam.angle) * this.height;
      layer.line({ x1: originX, y1: originY, x2: endX, y2: endY, width: beam.width * 2.4, color: "#ffffff", opacity: 0.5, z: 5 });
      layer.line({ x1: originX, y1: originY, x2: endX, y2: endY, width: beam.width, color: beam.color, z: 6 });
    });
    if (combat.laserWarmup > 0) layer.circle({ x: combat.player.x + ox, y: combat.player.y - 28 + oy, radius: 8 + Math.sin(this.time * 22) * 3, color: "#ffffff", border: FIGHTERS[this.state.fighterId].accent, z: 7 });
  }

  drawEnemies(layer, combat, ox, oy) {
    combat.entities.enemies.forEach((enemy) => {
      const x = enemy.x + ox;
      const y = enemy.y + oy;
      const visual = enemy.visual || {};
      const engineCount = visual.engines || 1;
      for (let index = 0; index < engineCount; index += 1) {
        const offset = (index - (engineCount - 1) / 2) * Math.min(11, enemy.radius * 0.36);
        layer.line({ x1: x + offset, y1: y - enemy.radius * 0.45, x2: x + offset - enemy.bank * 18, y2: y - enemy.radius * (0.9 + enemy.damageSmoke * 0.5), width: 2.2 + enemy.damageSmoke * 2.2, color: enemy.damageSmoke > 0.55 ? "#cf694f" : "#67d8ef", opacity: 0.58, z: 1 });
      }
      if (enemy.damageSmoke > 0.42) layer.circle({ x: x - enemy.bank * 20, y: y - enemy.radius * 0.8, radius: 4 + enemy.damageSmoke * 8, color: "#2a3032", opacity: 0.18 + enemy.damageSmoke * 0.25, z: 1 });
      this.drawAircraft(layer, x, y, enemy.radius, enemy.hitFlash > 0 ? "#ffffff" : enemy.color, enemy.type, 2, enemy.bank, { ...visual, facing: "down" });
    });
  }

  drawSkillEffect(layer, combat, fighter, ox, oy) {
    const effect = combat.passiveEffect;
    if (!effect) return;
    const progress = clamp(effect.elapsed / 1.35, 0, 1);
    const x = combat.player.x + ox;
    const y = combat.player.y - 30 + oy;
    const fade = 1 - progress * 0.7;
    if (effect.style === "command-lock") {
      combat.entities.enemies.slice(0, 6).forEach((enemy) => layer.circle({ x: enemy.x + ox, y: enemy.y + oy, radius: 18 + progress * 8, color: fighter.accent, opacity: 0.04, border: fighter.accent, z: 7 }));
      layer.line({ x1: x, y1: y, x2: x, y2: 80, width: 4 + progress * 5, color: fighter.secondary, opacity: fade, z: 7 });
    } else if (effect.style === "twin-intercept") {
      layer.line({ x1: 12, y1: y - 120 * progress, x2: this.width - 12, y2: y - 280 * progress, width: 5, color: fighter.accent, opacity: fade, z: 7 });
      layer.line({ x1: this.width - 12, y1: y - 120 * progress, x2: 12, y2: y - 280 * progress, width: 5, color: fighter.secondary, opacity: fade, z: 7 });
    } else if (effect.style === "drone-formation") {
      [[-78, -120], [78, -120], [0, -230]].forEach(([dx, dy]) => layer.line({ x1: x, y1: y, x2: x + dx * (0.6 + progress * 0.4), y2: y + dy, width: 3, color: fighter.accent, opacity: fade, z: 7 }));
    } else if (effect.style === "ghost-execute") {
      combat.entities.enemies.filter((enemy) => enemy.marked).forEach((enemy) => layer.line({ x1: enemy.x - 14 + ox, y1: enemy.y - 14 + oy, x2: enemy.x + 14 + ox, y2: enemy.y + 14 + oy, width: 3, color: fighter.accent, opacity: fade, z: 8 }));
    } else if (effect.style === "storm-pierce") {
      layer.line({ x1: x, y1: y, x2: x, y2: 40, width: 5 + progress * 13, color: fighter.accent, opacity: fade, z: 7 });
    } else if (effect.style === "phase-resonance") {
      for (let index = 0; index < 3; index += 1) layer.circle({ x: x + Math.sin(progress * Math.PI * 4 + index) * 68, y: y - 90 - index * 52, radius: 10 + progress * 12, color: index % 2 ? fighter.secondary : fighter.accent, opacity: 0.05, border: fighter.accent, z: 7 });
    } else if (effect.style === "graze-overclock") {
      for (let index = 0; index < 5; index += 1) layer.line({ x1: x + (index - 2) * 18, y1: y, x2: x + (index - 2) * 30, y2: 70, width: 3, color: fighter.accent, opacity: fade, z: 7 });
    } else if (effect.style === "armor-counter") {
      layer.circle({ x, y: y - 90, radius: 28 + progress * 72, color: fighter.secondary, opacity: 0.08 * fade, border: fighter.accent, z: 7 });
    } else if (effect.style === "hyper-chain") {
      [-0.18, 0, 0.18].forEach((angle) => layer.line({ x1: x, y1: y, x2: x + Math.sin(angle) * this.height, y2: y - Math.cos(angle) * this.height, width: 5 + combat.formChain, color: fighter.accent, opacity: fade, z: 7 }));
    }
  }

  drawAircraft(layer, x, y, radius, color, type, z, bank = 0, visual = {}) {
    const facing = visual.facing === "down" ? -1 : 1;
    const py = (offset) => y + offset * facing;
    if (type === "helicopter") {
      layer.polygon({
        points: [
          { x: x - radius * 0.58, y: py(-radius * 0.52) },
          { x: x + radius * 0.38, y: py(-radius * 0.52) },
          { x: x + radius * 0.66, y: py(-radius * 0.12) },
          { x: x + radius * 0.25, y: py(radius * 0.48) },
          { x: x - radius * 0.54, y: py(radius * 0.38) },
          { x: x - radius * 0.78, y: y },
        ],
        color,
        border: "#d4f3e0",
        z,
      });
      layer.line({ x1: x - radius * 1.25, y1: py(-radius * 0.72), x2: x + radius * 1.25, y2: py(-radius * 0.72), width: 3, color: "#d4f3e0", opacity: 0.8, z: z + 1 });
      layer.line({ x1: x + radius * 0.38, y1: py(radius * 0.18), x2: x + radius * 1.18, y2: py(radius * 0.62), width: 5, color, z: z + 1 });
      layer.circle({ x: x - radius * 0.12, y: py(-radius * 0.12), radius: radius * 0.2, color: "#88d7e7", z: z + 2 });
      return;
    }
    const wide = type === "bomber" || type === "elite" || type === "carrier" || type === "splitter";
    const narrow = type === "sniper" || type === "fighter" || type === "scout";
    const silhouette = visual.silhouette || type;
    const span = silhouette === "heavy-wing" ? 1.62 : silhouette === "manta" ? 1.5 : silhouette === "needle" ? 0.72 : wide ? 1.36 : narrow ? 0.94 : 1.12;
    const tail = silhouette === "needle" ? 1.42 : silhouette === "heavy-wing" ? 0.78 : 1;
    const skew = bank * radius * 0.72;
    const points = [
      { x: x + skew * 0.12, y: py(-radius * 1.22 * tail) },
      { x: x + radius * 0.26 + skew * 0.25, y: py(-radius * 0.44) },
      { x: x + radius * span + skew, y: py(radius * 0.08) },
      { x: x + radius * 0.42, y: py(radius * 0.28) },
      { x: x + radius * 0.34, y: py(radius * 0.98) },
      { x, y: py(radius * 0.68) },
      { x: x - radius * 0.34, y: py(radius * 0.98) },
      { x: x - radius * 0.42, y: py(radius * 0.28) },
      { x: x - radius * span + skew, y: py(radius * 0.08) },
      { x: x - radius * 0.26 + skew * 0.25, y: py(-radius * 0.44) },
    ];
    layer.polygon({ points, color, border: type === "elite" ? "#ffd36a" : "#f3c8b4", z });
    layer.line({ x1: x + skew * 0.1, y1: py(-radius * 0.72), x2: x, y2: py(radius * 0.54), width: Math.max(2, radius * 0.12), color: visual.stripe || "#f7d7c4", opacity: 0.72, z: z + 1 });
    if (["twin-boom", "heavy-wing", "ace"].includes(silhouette)) {
      for (const side of [-1, 1]) layer.rect({ x: x + side * radius * 0.42 - radius * 0.1, y: facing > 0 ? py(radius * 0.08) : py(radius * 0.7), width: radius * 0.2, height: radius * 0.62, color: darkenHex(color, 0.36), border: visual.stripe || "#d7aa78", z: z + 1 });
    }
    if (silhouette === "disc-wing") layer.circle({ x, y, radius: radius * 0.58, color: darkenHex(color, 0.12), opacity: 0.75, border: visual.stripe, z: z + 1 });
    if (silhouette === "cranked-wing") {
      layer.line({ x1: x - radius * 1.08, y1: py(radius * 0.1), x2: x - radius * 0.44, y2: py(-radius * 0.35), width: 4, color: visual.stripe, z: z + 1 });
      layer.line({ x1: x + radius * 1.08, y1: py(radius * 0.1), x2: x + radius * 0.44, y2: py(-radius * 0.35), width: 4, color: visual.stripe, z: z + 1 });
    }
    if (type === "spinner") {
      layer.line({ x1: x - radius * 0.88, y1: py(-radius * 0.12), x2: x + radius * 0.88, y2: py(radius * 0.12), width: 3, color: "#ffe29a", z: z + 2 });
    }
    layer.circle({ x, y: py(-radius * 0.18), radius: Math.max(3.2, radius * 0.22), color: type === "sniper" ? "#63d8ff" : "#ffd36a", border: COLORS.battleInk, z: z + 2 });
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
    const x = boss.x + ox;
    const y = boss.y + oy;
    const body = boss.phase === 3 ? darkenHex(boss.accent, 0.3) : "#365665";
    const span = boss.silhouette === "trident" ? 92 : boss.silhouette === "ring-carrier" ? 84 : 72;
    const opacity = boss.mechanic === "cloak" ? 0.48 + (1 - boss.cloak) * 0.5 : 1;
    layer.polygon({ points: [{ x, y: y + 72 }, { x: x + 28, y: y + 34 }, { x: x + span, y: y - 8 }, { x: x + 42, y: y - 34 }, { x: x + 26, y: y - 62 }, { x, y: y - 44 }, { x: x - 26, y: y - 62 }, { x: x - 42, y: y - 34 }, { x: x - span, y: y - 8 }, { x: x - 28, y: y + 34 }], color: body, opacity, border: boss.accent, z: 1 });
    if (boss.silhouette === "ring-carrier") layer.circle({ x, y: y + 4, radius: 42, color: "#071a28", opacity: 0.38, border: boss.accent, z: 2 });
    if (boss.silhouette === "trident") for (const dx of [-34, 0, 34]) layer.line({ x1: x + dx * 0.45, y1: y + 24, x2: x + dx, y2: y + 78, width: 8, color: boss.accent, opacity: 0.76, z: 2 });
    layer.circle({ x, y: y + 12, radius: 13 + boss.phase * 2, color: boss.phase === 3 ? "#ffcc54" : boss.accent, border: "#fff3b0", z: 4 });
    if (boss.telegraph) {
      const pulse = 28 + (0.58 - boss.telegraph.timer) * 70;
      layer.circle({ x, y: y + 8, radius: pulse, color: boss.accent, opacity: 0.05, border: "#ff6b58", z: 5 });
      layer.line({ x1: x, y1: y + 20, x2: combat.player.x + ox, y2: combat.player.y + oy, width: 2.5, color: "#ff6b58", opacity: 0.62, z: 5 });
    }
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
    const size = fighterCombatScale(combat.transformed);
    const x = player.x + ox;
    const y = player.y + oy;
    if (combat.barrierTime > 0) {
      layer.circle({ x, y: y - 12, radius: 48 + Math.sin(this.time * 8) * 2, color: "#efb632", opacity: 0.08, border: "#efb632", z: 7 });
      layer.line({ x1: x - 38, y1: y - 30, x2: x, y2: y - 52, width: 5, color: "#efb632", opacity: 0.8, z: 8 });
      layer.line({ x1: x, y1: y - 52, x2: x + 38, y2: y - 30, width: 5, color: "#efb632", opacity: 0.8, z: 8 });
    }
    if (player.shieldCharges > 0) layer.circle({ x, y, radius: 30 * size, color: fighter.accent, opacity: 0.05, border: fighter.accent, z: 7 });
    const hull = this.drawFighterHull(layer, fighter, x, y, size, { transformed: combat.transformed, detail: this.quality === "low" ? "low" : "medium", glow: combat.transformed, z: 8 });
    const span = hull.span;
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
    layer.rect({ ...layout.hud, color: COLORS.battleInk, opacity: 0.74, border: darkenHex(fighter.accent, 0.46), z: 20 });
    layer.rect({ x: layout.hud.x, y: layout.hud.y, width: 3, height: layout.hud.height, color: fighter.accent, opacity: 0.9, z: 21 });
    layer.text(`${fighter.country} / ${fighter.shortName}`, { x: layout.hud.x + 9, y: layout.hud.y + 5, width: 92, height: 15, color: fighter.accent, fontSize: 8, weight: 900, z: 21 });
    layer.text(String(Math.round(combat.score)).padStart(6, "0"), { x: layout.hud.x + 9, y: layout.hud.y + 19, width: 90, height: 24, color: COLORS.ink, fontSize: 16, weight: 900, z: 21 });
    layer.text(`连击 ×${combat.combo}`, { x: layout.hud.x + 9, y: layout.hud.y + 41, width: 88, height: 14, color: combat.combo >= 8 ? COLORS.gold : COLORS.soft, fontSize: 8, weight: 900, z: 21 });

    const healthX = layout.hud.x + 101;
    const healthWidth = Math.max(78, layout.pause.x - healthX - 8);
    const healthRatio = clamp(combat.player.health / combat.player.maxHealth, 0, 1);
    layer.text(`耐久 ${Math.ceil(combat.player.health)} / ${combat.player.maxHealth}`, { x: healthX, y: layout.hud.y + 5, width: healthWidth, height: 16, color: healthRatio <= 0.28 ? COLORS.red : COLORS.ink, fontSize: 8, weight: 900, z: 21 });
    layer.rect({ x: healthX, y: layout.hud.y + 23, width: healthWidth, height: 5, color: COLORS.muted, z: 21 });
    layer.rect({ x: healthX, y: layout.hud.y + 23, width: healthWidth * healthRatio, height: 5, color: healthRatio <= 0.28 ? COLORS.red : COLORS.green, z: 22 });
    layer.line({ x1: healthX, y1: layout.hud.y + 30, x2: healthX + healthWidth * clamp(combat.player.shieldCharges / 3, 0, 1), y2: layout.hud.y + 30, width: 2, color: COLORS.blue, opacity: 0.72, z: 22 });
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
    else if (state.fighterId === "gripen") passiveStatus = `超频 ${combat.overclockStacks || 0}/12`;
    else if (state.fighterId === "su57") passiveStatus = `反击 ${combat.counterCharge || 0}/5`;
    const weaponText = mode.pattern === "laser" ? `${mode.name} · 热量 ${Math.round(combat.laserHeat)}%` : `${mode.name} · 武器 LV.${combat.weaponLevel}`;
    layer.text(`${weaponText} · ${passiveStatus}`, { x: healthX, y: layout.hud.y + 44, width: healthWidth, height: 13, color: fighter.accent, fontSize: 7, weight: 900, z: 21 });
    this.button(layer, layout.pause, "暂停", false, "surface", 24, state.uiPress === "pause");

    const map = BATTLE_MAPS[state.mapId];
    const cadence = battleCadence(combat.elapsed);
    const situationY = layout.hud.y + layout.hud.height + 7;
    if (!combat.boss && !combat.mission) {
      layer.text(`${cadence.label} · ${map.objective}`, { x: 14, y: situationY, width: this.width - 28, height: 18, color: map.accent, fontSize: 7.5, align: "center", weight: 850, z: 21 });
    }

    const labels = { transform: [combat.transformed ? "强袭" : "变身", combat.transformed ? combat.transformTime.toFixed(1) : `${combat.transformCores}/3`] };
    Object.values(layout.actions).forEach((rect) => {
      const active = rect.id === "transform" && (combat.transformed || combat.transformCores >= 3);
      this.actionButton(layer, rect, labels[rect.id], {
        active,
        primary: true,
        pressed: state.uiPress === rect.id,
        accent: fighter.accent,
      });
    });
    const ability = fighterAbility(state.fighterId);
    const passiveRatio = 1 - clamp(combat.passiveTimer / Math.max(0.1, combat.passiveInterval), 0, 1);
    layer.text(`被动 · ${ability.passive.name} ${Math.round(passiveRatio * 100)}%`, { x: layout.weapon.x, y: layout.weapon.y - 18, width: layout.weapon.width, height: 14, color: fighter.accent, fontSize: 7.5, weight: 900, z: 25 });
    const weaponPressed = state.uiPress === "form";
    layer.rect({ ...layout.weapon, color: weaponPressed ? COLORS.surfaceStrong : COLORS.battleInk, opacity: 0.8, border: darkenHex(fighter.accent, 0.2), z: 24 });
    layer.rect({ x: layout.weapon.x, y: layout.weapon.y, width: 3, height: layout.weapon.height, color: fighter.accent, z: 25 });
    layer.text(`武器 ${combat.toolModeIndex + 1}/${combat.toolModes.length}`, { x: layout.weapon.x + 8, y: layout.weapon.y + 5, width: layout.weapon.width - 16, height: 16, color: fighter.accent, fontSize: 8, weight: 900, z: 25 });
    layer.text(mode.name, { x: layout.weapon.x + 8, y: layout.weapon.y + 22, width: layout.weapon.width - 16, height: 20, color: COLORS.ink, fontSize: 10, weight: 900, z: 25 });

    if (combat.boss) {
      const width = Math.min(this.width - 34, 380);
      const x = (this.width - width) / 2;
      const y = layout.hud.y + layout.hud.height + 8;
      layer.rect({ x, y, width, height: 38, color: COLORS.battleInk, opacity: 0.94, border: "#874c51", z: 20 });
      layer.text(`${combat.boss.name} · ${combat.boss.title} · 阶段 ${combat.boss.phase}`, { x: x + 8, y: y + 3, width: width - 16, height: 16, color: COLORS.ink, fontSize: 7.5, align: "center", weight: 900, z: 21 });
      layer.rect({ x: x + 12, y: y + 23, width: width - 24, height: 6, color: "#6f3836", z: 21 });
      layer.rect({ x: x + 12, y: y + 23, width: (width - 24) * clamp(combat.boss.health / combat.boss.maxHealth, 0, 1), height: 6, color: "#ef6b55", z: 22 });
      const partWidth = (width - 30) / 2;
      for (const [index, key] of ["left", "right"].entries()) {
        const part = combat.boss.parts[key];
        const px = x + 12 + index * (partWidth + 6);
        layer.line({ x1: px, y1: y + 33, x2: px + partWidth * clamp(part.health / part.maxHealth, 0, 1), y2: y + 33, width: 2, color: part.destroyed ? COLORS.soft : combat.boss.accent, opacity: 0.8, z: 22 });
      }
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

  drawToast(state, y, layer = this.uiLayer) {
    if (!state.toast) return;
    const width = Math.min(this.width - 32, 340);
    layer.rect({ x: (this.width - width) / 2, y, width, height: 38, color: COLORS.battleInk, opacity: 0.92, border: COLORS.line, z: 40 });
    layer.text(state.toast.text, { x: (this.width - width) / 2 + 8, y: y + 4, width: width - 16, height: 30, color: COLORS.ink, fontSize: 10, align: "center", weight: 800, z: 41 });
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

  drawModal(modal, targetLayer = this.uiLayer) {
    if (modal.type === "map") {
      this.drawMapModal(modal, targetLayer);
      return;
    }
    const layer = targetLayer;
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

  drawMapModal(modal, targetLayer = this.uiLayer) {
    const layer = targetLayer;
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
