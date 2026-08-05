import { createMapStructures, getBattleMap, pointInsideHazard, pointInsideStructure, resolveCircleFromStructure } from "../content/battle-maps.js";
import { FIGHTERS, getWingmanSpec } from "../content/fighter-profiles.js";
import { fighterAbility, fighterUpgradeChoices } from "../content/fighter-abilities.js";
import { fighterCombatScale, fighterWeaponOrigins } from "../content/fighter-geometry.js";
import {
  AIRDROP_ESCORT_DURATION,
  PARTICLE_LIMIT,
  TRANSFORM_CORE_COST,
  TRANSFORM_DURATION,
  airdropRewardSpec,
  assaultFireSpec,
  canEnterCoreTransform,
  combatPhase,
  laserModeSpec,
  projectileBudget,
  toolModeSpec,
} from "../content/gameplay-rules.js";
import { MINI_MISSIONS, coasterMotion, connectedChain, isInsideCarrierDeck, nextMiniMission, ringContainsPlayer } from "../content/mini-missions.js";
import { ENEMY_CONFIGS, bossSpec, difficultyFromPerformance, enemyTypeForSpawn } from "./enemy-config.js";
import { ObjectPool } from "./object-pool.js";

const PICKUP_COLORS = {
  core: "#e34c43",
  evolution: "#9866df",
  trajectory: "#2f91c8",
  health: "#43a87c",
  barrier: "#efb632",
  ally: "#2ec7bf",
  "meteor-core": "#ef724b",
};

const PICKUP_LABELS = {
  core: "变身能量 +1",
  evolution: "机体进化提升",
  trajectory: "弹道升级",
  health: "修复并获得护盾",
  barrier: "全防御屏障 8 秒",
  ally: "友军双机加入",
  "meteor-core": "陨星核心强化",
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

export function circlesOverlap(a, b, padding = 0) {
  if (!a || !b) return false;
  return Math.hypot(a.x - b.x, a.y - b.y) <= (a.radius || 0) + (b.radius || 0) + padding;
}

export function distanceToSegment(x, y, segment) {
  const vx = segment.x2 - segment.x1;
  const vy = segment.y2 - segment.y1;
  const lengthSquared = vx * vx + vy * vy || 1;
  const t = clamp(((x - segment.x1) * vx + (y - segment.y1) * vy) / lengthSquared, 0, 1);
  return Math.hypot(x - (segment.x1 + vx * t), y - (segment.y1 + vy * t));
}

export function x10TransformStage(secondsRemaining) {
  const elapsed = TRANSFORM_DURATION - clamp(secondsRemaining, 0, TRANSFORM_DURATION);
  return Math.min(3, Math.floor(elapsed / (TRANSFORM_DURATION / 4)));
}

function resetEntity(item, values) {
  for (const key of Object.keys(item)) delete item[key];
  Object.assign(item, values, { active: true });
}

function createPools() {
  return {
    playerProjectiles: new ObjectPool(() => ({}), resetEntity, 48),
    enemyProjectiles: new ObjectPool(() => ({}), resetEntity, 48),
    enemies: new ObjectPool(() => ({}), resetEntity, 24),
    particles: new ObjectPool(() => ({}), resetEntity, 64),
    pickups: new ObjectPool(() => ({}), resetEntity, 12),
    meteors: new ObjectPool(() => ({}), resetEntity, 6),
    floatingTexts: new ObjectPool(() => ({}), resetEntity, 16),
  };
}

export class CombatSystem {
  constructor({ combat, fighterId, mapId, width, height, random = Math.random, emit = () => {}, performance = {} }) {
    this.state = combat;
    this.fighterId = fighterId;
    this.fighter = FIGHTERS[fighterId] || FIGHTERS.j20;
    this.mapId = mapId;
    this.map = getBattleMap(mapId);
    this.width = Math.max(320, Number(width) || 375);
    this.height = Math.max(568, Number(height) || 812);
    this.random = random;
    this.emit = emit;
    this.pools = createPools();
    this.state.difficulty = difficultyFromPerformance({
      current: 1,
      consecutiveDeaths: performance.consecutiveDeaths,
      clearStreak: performance.clearStreak,
    });
    this.state.player.x = this.width / 2;
    this.state.player.y = this.height * 0.78;
    this.state.mapStructures = createMapStructures(this.mapId, this.width, this.height);
    this.state.notice = { title: "战机已接管", text: `${this.fighter.displayName} // 武器 LV.3`, time: 2.4 };
    this.state.ability = fighterAbility(this.fighterId);
  }

  resize(width, height) {
    const oldWidth = this.width;
    const oldHeight = this.height;
    this.width = Math.max(320, Number(width) || 320);
    this.height = Math.max(568, Number(height) || 568);
    this.state.player.x = clamp(this.state.player.x * this.width / oldWidth, 24, this.width - 24);
    this.state.player.y = clamp(this.state.player.y * this.height / oldHeight, 90, this.height - 96);
    this.state.mapStructures = createMapStructures(this.mapId, this.width, this.height);
  }

  signal(type, payload = {}) {
    this.emit({ type, ...payload });
  }

  notify(title, text, time = 2.4) {
    this.state.notice = { title, text, time };
    this.signal("message", { title, text });
  }

  play(name, payload = {}) {
    this.signal("sound", { name, payload });
  }

  vibrate(kind = "light") {
    this.signal("vibrate", { kind });
  }

  acquire(kind, values) {
    const item = this.pools[kind].acquire(values);
    this.state.entities[kind].push(item);
    return item;
  }

  releaseAt(kind, index) {
    const [item] = this.state.entities[kind].splice(index, 1);
    if (item) this.pools[kind].release(item);
  }

  clearEntityKind(kind) {
    const list = this.state.entities[kind];
    while (list.length) this.releaseAt(kind, list.length - 1);
  }

  update(dt) {
    const state = this.state;
    if (!state.running || state.ended) return;
    const step = clamp(dt, 0, 0.05);
    if (state.hitStop > 0) {
      state.hitStop = Math.max(0, state.hitStop - step);
      return;
    }
    const timeScale = state.slowMotion > 0 ? 0.45 : 1;
    const delta = step * timeScale;
    state.slowMotion = Math.max(0, state.slowMotion - step);
    state.elapsed += delta;
    state.shake = Math.max(0, state.shake - 28 * step);
    state.flash = Math.max(0, state.flash - step * 3.5);
    if (state.notice) {
      state.notice.time -= step;
      if (state.notice.time <= 0) state.notice = null;
    }
    this.updateBossDefeatFx(step);

    this.updateWave();
    this.updateTimers(delta);
    this.updatePassive(delta);
    this.updateTransform(delta);
    this.updateNuclear(delta);
    this.updatePassiveEffect(delta);
    this.updateAutoWingman(delta);

    if (state.mission) {
      this.updatePlayerWeapons(delta);
      this.updateMission(delta);
      this.updatePlayerProjectiles(delta);
    } else {
      this.updateMap(delta);
      this.updateMeteors(delta);
      this.updateAirdrop(delta);
      this.updateEnemies(delta);
      this.updateBoss(delta);
      this.updatePlayerWeapons(delta);
      this.updateAllies(delta);
      this.updatePlayerProjectiles(delta);
      this.updateEnemyProjectiles(delta);
      this.updatePickups(delta);
      this.checkMissionSchedule();
    }
    this.updateParticles(delta);
    this.state.quality.pooled = Object.values(this.pools).reduce((sum, pool) => sum + pool.free.length, 0);
  }

  updateWave() {
    const state = this.state;
    const nextWave = Math.floor(state.elapsed / 15) + 1;
    if (nextWave === state.wave) return;
    state.wave = nextWave;
    state.waveClearStreak += 1;
    if (state.waveClearStreak >= 3) {
      state.difficulty = difficultyFromPerformance({ current: state.difficulty, clearStreak: 3 });
      state.waveClearStreak = 0;
    }
    this.notify(`第 ${String(state.wave).padStart(2, "0")} 波`, `压力系数 ${state.difficulty.toFixed(2)}`, 1.8);
    this.play("wave");
  }

  updateTimers(dt) {
    const state = this.state;
    state.wingmanCooldown = Math.max(0, state.wingmanCooldown - dt);
    state.wingmanTime = Math.max(0, state.wingmanTime - dt);
    state.overdrive = Math.max(0, state.overdrive - dt);
    state.firepowerTime = Math.max(0, state.firepowerTime - dt);
    state.barrierTime = Math.max(0, state.barrierTime - dt);
    state.player.invulnerable = Math.max(0, state.player.invulnerable - dt);
    state.recentHitTime = Math.max(0, state.recentHitTime - dt);
    state.dangerTick = Math.max(0, state.dangerTick - dt);
    state.comboTimer = Math.max(0, (state.comboTimer || 0) - dt);
    if (state.comboTimer <= 0) state.combo = Math.max(1, Math.floor(state.combo * 0.5));
    for (let index = state.entities.floatingTexts.length - 1; index >= 0; index -= 1) {
      const text = state.entities.floatingTexts[index];
      text.y -= 28 * dt;
      text.life -= dt;
      if (text.life <= 0) this.releaseAt("floatingTexts", index);
    }
  }

  updateTransform(dt) {
    const state = this.state;
    if (!state.transformed) return;
    state.transformTime = Math.max(0, state.transformTime - dt);
    if (state.transformTime < 1e-6) state.transformTime = 0;
    state.transformStage = this.fighterId === "hypersonic" ? x10TransformStage(state.transformTime) : 1;
    if (state.transformTime > 0) return;
    state.transformed = false;
    state.transformStage = 0;
    this.notify("强袭结束", "已恢复飞行形态", 1.8);
    this.play("transformEnd");
  }

  movePlayer(x, y) {
    const state = this.state;
    if (state.ended) return false;
    let next = {
      x: clamp(x, state.player.radius + 6, this.width - state.player.radius - 6),
      y: clamp(y - 54, 96, this.height - 94),
      radius: state.player.radius,
    };
    let collided = false;
    for (const structure of state.mapStructures) {
      const resolved = resolveCircleFromStructure(next, structure);
      if (!resolved.collided) continue;
      collided = true;
      next = { ...next, x: resolved.x, y: resolved.y };
    }
    state.player.x = clamp(next.x, state.player.radius + 6, this.width - state.player.radius - 6);
    state.player.y = clamp(next.y, 96, this.height - 94);
    if (collided && state.player.invulnerable <= 0) {
      state.player.invulnerable = 0.25;
      state.shake = Math.max(state.shake, 4);
      this.play("collision");
      this.vibrate("light");
    }
    return !collided;
  }

  cycleTool() {
    const state = this.state;
    state.toolModeIndex = (state.toolModeIndex + 1) % state.toolModes.length;
    state.pendingLaser = null;
    state.laserWarmup = 0;
    const mode = toolModeSpec(this.fighterId, state.toolModeIndex);
    state.formUses = (state.formUses || 0) + 1;
    if (this.fighterId === "hypersonic") {
      state.formChain = state.toolModeIndex === state.lastToolModeIndex ? state.formChain : Math.min(5, state.formChain + 1);
      state.lastToolModeIndex = state.toolModeIndex;
    }
    this.notify("攻击形态切换", mode.name, 1.6);
    this.play("switchForm", { pattern: mode.pattern });
    return mode;
  }

  tryTransform() {
    const state = this.state;
    if (state.transformed) {
      this.notify("强袭进行中", `剩余 ${state.transformTime.toFixed(1)} 秒`, 1.2);
      return false;
    }
    if (!canEnterCoreTransform(state.transformCores)) {
      this.notify("能量不足", `需要 ${TRANSFORM_CORE_COST} 个红色能量球`, 1.8);
      this.play("reject");
      return false;
    }
    state.transformCores -= TRANSFORM_CORE_COST;
    state.transformed = true;
    state.transformTime = TRANSFORM_DURATION;
    state.transformStage = 0;
    state.transformReadyAnnounced = false;
    state.transformUses = (state.transformUses || 0) + 1;
    state.shake = 13;
    state.flash = 0.8;
    state.player.invulnerable = Math.max(state.player.invulnerable, 0.8);
    this.notify(this.fighter.transformation.label, "10 秒强袭火力已启动", 2.6);
    this.play("transform", { fighterId: this.fighterId });
    this.vibrate("heavy");
    return true;
  }

  passiveChargeRate() {
    const state = this.state;
    if (this.fighterId === "j20") return 1 + Math.min(0.75, state.entities.enemies.filter((enemy) => enemy.marked).length * 0.15);
    if (this.fighterId === "j35") return 1 + Math.min(1, state.entities.enemies.filter((enemy) => enemy.marked).length * 0.2);
    if (this.fighterId === "faxx") return state.entities.playerProjectiles.length > 0 || state.laserBeams.length > 0 ? 1.2 : 1;
    if (this.fighterId === "f22") return state.recentHitTime <= 0 ? 1.35 : 1;
    if (this.fighterId === "typhoon") return 1 + Math.min(0.9, (state.stormPierceHits || 0) * 0.12);
    if (this.fighterId === "rafale") return 1 + Math.min(0.8, Math.max(0, ...state.entities.enemies.map((enemy) => enemy.resonance || 0)) * 0.16);
    if (this.fighterId === "gripen") return 1 + Math.min(1.2, (state.overclockStacks || 0) * 0.1);
    if (this.fighterId === "su57") return 1 + Math.min(1, (state.counterCharge || 0) * 0.18);
    if (this.fighterId === "hypersonic") return 1 + Math.min(0.9, (state.formChain || 0) * 0.18);
    return 1;
  }

  updatePassive(dt) {
    const state = this.state;
    if (state.ended || state.mission || state.pendingUpgrade) return false;
    state.passiveTimer = Math.max(0, state.passiveTimer - dt * Math.min(2.2, this.passiveChargeRate()));
    if (state.passiveTimer > 0) return false;
    return this.triggerPassive();
  }

  triggerPassive() {
    const state = this.state;
    const tactical = this.fighter.tactical;
    const ability = fighterAbility(this.fighterId);
    state.passiveTimer = ability.passive.interval;
    state.passiveInterval = ability.passive.interval;
    state.passiveUses = (state.passiveUses || 0) + 1;
    state.shake = 8;
    state.flash = 0.34;
    state.passiveEffect = { style: ability.style, timer: 1.35, elapsed: 0, bursts: 0 };
    if (tactical.projectile === "nuclear") {
      state.nuclear = { warning: 0.62, timer: 1.25, x: state.player.x, y: state.player.y - 80 };
      this.notify("天穹核裁决", "核弹锁定，1.2 秒后引爆", 1.8);
      this.play("nuclearLaunch");
      this.vibrate("heavy");
      return true;
    }
    if (this.fighterId === "f22") state.player.invulnerable = Math.max(state.player.invulnerable, state.upgrades.includes("ghost-cloak") ? 1.8 : 1.2);
    if (["j35", "f22"].includes(this.fighterId)) {
      for (let index = state.entities.enemies.length - 1; index >= 0; index -= 1) {
        const enemy = state.entities.enemies[index];
        if (!enemy.marked) continue;
        const executeRatio = state.upgrades.includes("ghost-threshold") ? 0.48 : 0.36;
        enemy.health -= this.fighterId === "f22" && enemy.health / enemy.maxHealth <= executeRatio ? Math.max(enemy.health, 18) : this.fighterId === "f22" ? 24 : 14;
        this.spawnParticles(enemy.x, enemy.y, 10, this.fighter.accent);
        if (enemy.health <= 0) this.killEnemy(index);
      }
    }
    const counterBonus = this.fighterId === "su57" ? 1 + (state.counterCharge || 0) * 0.22 : 1;
    state.counterCharge = this.fighterId === "su57" ? 0 : state.counterCharge;
    if (this.fighterId === "faxx") this.deployPassiveWingmen();
    const count = Math.max(1, tactical.count + (this.fighterId === "gripen" ? Math.min(8, state.overclockStacks || 0) : 0));
    const center = (count - 1) / 2;
    const origins = fighterWeaponOrigins(this.fighter, state.player.x, state.player.y, fighterCombatScale(state.transformed), tactical.projectile, count);
    for (let index = 0; index < count; index += 1) {
      let angle = (index - center) * Math.min(0.12, 1.35 / count);
      if (this.fighterId === "j35") angle += index % 2 ? -0.16 : 0.16;
      if (this.fighterId === "rafale") angle += Math.sin(index * Math.PI) * 0.12;
      this.spawnPlayerProjectile({
        x: origins[index].x,
        y: origins[index].y,
        angle,
        speed: tactical.projectile === "rail" ? 1250 : tactical.projectile === "heavy" ? 680 : 820,
        type: tactical.projectile,
        damage: this.fighter.damage * (tactical.projectile === "heavy" ? 4.2 : 2.1) * counterBonus,
        radius: tactical.projectile === "heavy" ? (state.upgrades.includes("armor-blast") ? 12 : 8) : this.fighterId === "typhoon" && state.upgrades.includes("storm-width") ? 8 : 5,
        pierce: tactical.projectile === "rail" ? 4 : 0,
        modifier: ability.style,
      });
    }
    if (this.fighterId === "gripen") state.overclockStacks = 0;
    if (this.fighterId === "su57" && counterBonus >= 2 && state.upgrades.includes("armor-shield")) state.player.shieldCharges = Math.min(4, state.player.shieldCharges + 1);
    this.notify(`被动触发 · ${ability.passive.name}`, `${count} 发专属齐射`, 1.8);
    this.play("skill", { fighterId: this.fighterId });
    return true;
  }

  updatePassiveEffect(dt) {
    const effect = this.state.passiveEffect;
    if (!effect) return;
    effect.elapsed += dt;
    effect.timer -= dt;
    if (effect.style === "phase-resonance" && effect.bursts < 3 && effect.elapsed >= 0.28 + effect.bursts * 0.28) {
      const y = this.state.player.y - 150 - effect.bursts * 55;
      this.splashDamage(this.state.player.x, y, this.fighter.damage * 4.2, 82 + effect.bursts * 12);
      this.spawnParticles(this.state.player.x, y, 14, this.fighter.accent);
      effect.bursts += 1;
    }
    if (effect.style === "drone-formation" && effect.bursts < 1 && effect.elapsed >= 0.8) {
      this.splashDamage(this.state.player.x, this.state.player.y - 240, this.fighter.damage * 6, 110);
      effect.bursts = 1;
    }
    if (effect.timer <= 0) this.state.passiveEffect = null;
  }

  deployPassiveWingmen() {
    const bonus = this.state.upgrades.includes("falcon-drone") ? 1 : 0;
    const spec = getWingmanSpec(this.fighterId);
    for (let index = 0; index < 2 + bonus; index += 1) this.state.entities.allies.push({
      id: `passive-wingman-${this.state.nextEntityId++}`,
      source: "passive",
      index,
      count: 2 + bonus,
      x: this.state.player.x,
      y: this.state.player.y,
      radius: 10,
      health: 999,
      maxHealth: 999,
      duration: 4.5,
      fireTimer: index * 0.08,
      projectile: "drone",
      rate: spec.rate * 0.75,
      speed: spec.speed,
      damage: spec.damage,
      formation: "orbit",
    });
  }

  updateAutoWingman(dt) {
    const state = this.state;
    state.autoWingmanTimer = Math.max(0, (state.autoWingmanTimer ?? 8) - dt);
    if (state.autoWingmanTimer > 0 || state.elapsed < 8 || state.wingmanCooldown > 0 || state.wingmanTime > 0 || state.mission || state.boss) return;
    if (this.summonWingman()) state.autoWingmanTimer = 28;
  }

  chooseUpgrade(upgradeId) {
    const choice = fighterUpgradeChoices(this.fighterId, this.state.upgrades).find((item) => item.id === upgradeId)
      || fighterAbility(this.fighterId).upgrades.find((item) => item.id === upgradeId);
    if (!choice) return false;
    if (!this.state.upgrades.includes(choice.id)) this.state.upgrades.push(choice.id);
    this.state.pendingUpgrade = false;
    this.notify("战机进化", `${choice.name}已生效`, 2.2);
    this.play("pickup", { type: "evolution" });
    return true;
  }

  summonWingman() {
    const state = this.state;
    const spec = getWingmanSpec(this.fighterId);
    if (state.elapsed < 8) {
      this.notify("僚机尚未抵达", "开战 8 秒后自动加入", 1.4);
      this.play("reject");
      return false;
    }
    if (state.wingmanCooldown > 0 || state.wingmanTime > 0) {
      this.notify("僚机整备中", `${Math.max(state.wingmanCooldown, state.wingmanTime).toFixed(1)} 秒`, 1.4);
      this.play("reject");
      return false;
    }
    state.wingmanTime = spec.duration;
    state.wingmanCooldown = spec.cooldown;
    for (let index = 0; index < spec.count; index += 1) {
      state.entities.allies.push({
        id: `wingman-${state.nextEntityId++}`,
        source: "active",
        index,
        count: spec.count,
        x: state.player.x,
        y: state.player.y + 12,
        radius: 11,
        health: 32,
        maxHealth: 32,
        duration: spec.duration,
        fireTimer: index * 0.06,
        projectile: spec.projectile,
        rate: spec.rate,
        speed: spec.speed,
        damage: spec.damage,
        formation: spec.formation,
      });
    }
    this.notify(spec.name, `${spec.count} 架专属僚机已加入`, 1.8);
    this.play("wingman");
    return true;
  }

  updatePlayerWeapons(dt) {
    const state = this.state;
    this.updateLasers(dt);
    state.fireTimer -= dt;
    if (state.fireTimer > 0 || state.ended) return;
    const mode = toolModeSpec(this.fighterId, state.toolModeIndex);
    const assault = assaultFireSpec(state.transformed ? 1 : 0, this.fighterId);
    const x10Stage = this.fighterId === "hypersonic" && state.transformed ? state.transformStage : -1;
    const stageRate = x10Stage >= 0 ? [0.72, 0.8, 1.02, 0.55][x10Stage] : 1;
    const stageBonus = x10Stage >= 0 ? [2, 3, 1, 5][x10Stage] : 0;
    const stageDamage = x10Stage >= 0 ? [1.25, 1.45, 1.8, 2.2][x10Stage] : 1;
    const overdrive = state.overdrive > 0 || state.firepowerTime > 0;
    const base = 0.16 * this.fighter.fireRate * (Number(mode.rate) || 1);
    state.fireTimer = Math.max(0.035, base * assault.rateMultiplier * stageRate * (overdrive ? 0.72 : 1));
    if (mode.pattern === "laser") {
      this.startLaser(mode);
      return;
    }
    const phase = combatPhase(state.elapsed);
    const phaseLimit = phase === "identify" ? 3 : phase === "learn" ? 4 : phase === "expand" ? 6 : 8;
    const upgradeBonus = state.upgrades.includes("dragon-wing") ? 1 : 0;
    const extra = Math.floor((state.weaponLevel - 1) / 2) + state.trajectoryLevel + assault.projectileBonus + stageBonus + (overdrive ? 2 : 0) + upgradeBonus;
    const count = Math.min(phaseLimit + assault.projectileBonus + stageBonus, (mode.count || 1) + extra);
    const center = (count - 1) / 2;
    const levelDamage = (1 + (state.weaponLevel - 1) * 0.12 + state.trajectoryLevel * 0.08) * (this.fighterId === "hypersonic" ? 1 + state.formChain * 0.05 : 1);
    const origins = fighterWeaponOrigins(this.fighter, state.player.x, state.player.y, fighterCombatScale(state.transformed), mode.pattern, count);
    for (let index = 0; index < count; index += 1) {
      let angle = (index - center) * (mode.spread || 0);
      if (this.fighterId === "j35" && mode.pattern === "rail" && state.upgrades.includes("falcon-cross")) angle += index % 2 ? -0.11 : 0.11;
      this.spawnPlayerProjectile({
        x: origins[index].x,
        y: origins[index].y,
        angle,
        speed: mode.speed || 860,
        type: mode.pattern,
        damage: mode.damage * this.fighter.damage * levelDamage * stageDamage * (overdrive ? 1.35 : 1),
        radius: mode.pattern === "heavy" ? 8 : mode.pattern === "wave" ? 6 : 4.5,
        pierce: mode.pattern === "rail" ? 2 : 0,
        modifier: fighterAbility(this.fighterId).style,
      });
    }
    this.play("fire", { pattern: mode.pattern });
  }

  spawnPlayerProjectile({ x, y, angle = 0, speed = 800, type = "pulse", damage = 1, radius = 4, pierce = 0, modifier = "" }) {
    const budget = projectileBudget(this.state.elapsed, { transformed: this.state.transformed, boss: Boolean(this.state.boss) });
    if (this.state.entities.playerProjectiles.length >= budget.player) return null;
    return this.acquire("playerProjectiles", {
      id: this.state.nextEntityId++,
      x,
      y,
      originX: x,
      radius,
      vx: Math.sin(angle) * speed,
      vy: -Math.cos(angle) * speed,
      angle,
      speed,
      type,
      damage,
      pierce,
      modifier,
      baseVx: Math.sin(angle) * speed,
      age: 0,
      color: this.fighter.accent,
    });
  }

  startLaser(mode) {
    const state = this.state;
    if (state.laserWarmup > 0 || state.laserBeams.length || state.laserCooldown > 0) return false;
    const spec = laserModeSpec(mode);
    const heatMultiplier = assaultFireSpec(state.transformed ? 1 : 0, this.fighterId).heatMultiplier;
    if (state.laserHeat + spec.heat * heatMultiplier > 100) {
      state.laserHeat = 100;
      state.laserCooldown = spec.overheatCooldown;
      this.notify("激光过热", `冷却 ${spec.overheatCooldown.toFixed(1)} 秒`, 1.6);
      this.play("laserOverheat");
      return false;
    }
    state.pendingLaser = { ...mode, ...spec };
    state.laserWarmup = spec.warmup;
    this.play("laserCharge");
    return true;
  }

  updateLasers(dt) {
    const state = this.state;
    const mode = toolModeSpec(this.fighterId, state.toolModeIndex);
    const spec = laserModeSpec(mode);
    state.laserCooldown = Math.max(0, state.laserCooldown - dt);
    const coolingBonus = state.upgrades.includes("hyper-cooling") ? 1.45 : 1;
    if (state.laserWarmup <= 0 && state.laserBeams.length === 0) state.laserHeat = Math.max(0, state.laserHeat - spec.coolRate * coolingBonus * dt);
    if (state.laserWarmup > 0) {
      state.laserWarmup = Math.max(0, state.laserWarmup - dt);
      if (state.laserWarmup === 0 && state.pendingLaser) {
        const pending = state.pendingLaser;
        state.pendingLaser = null;
        const assault = assaultFireSpec(state.transformed ? 1 : 0, this.fighterId);
        const x10Stage = this.fighterId === "hypersonic" && state.transformed ? state.transformStage : -1;
        const stageBeamBonus = x10Stage >= 0 ? [1, 2, 0, 3][x10Stage] : 0;
        const stageDamage = x10Stage >= 0 ? [1.25, 1.5, 1.85, 2.3][x10Stage] : 1;
        const count = Math.min(7, (pending.count || 1) + assault.laserBeamBonus + stageBeamBonus);
        const origins = fighterWeaponOrigins(this.fighter, state.player.x, state.player.y, fighterCombatScale(state.transformed), "laser", count);
        for (let index = 0; index < count; index += 1) {
          state.laserBeams.push({
            id: state.nextEntityId++,
            offsetX: origins[index].x - state.player.x,
            offsetY: origins[index].y - state.player.y,
            angle: (index - (count - 1) / 2) * (pending.spread || 0),
            width: pending.width,
            life: pending.duration,
            duration: pending.duration,
            damagePerSecond: pending.damage * this.fighter.damage * stageDamage * (1 + state.trajectoryLevel * 0.08) * (this.fighterId === "hypersonic" ? 1 + state.formChain * 0.05 : 1),
            color: index % 2 ? this.fighter.secondary : this.fighter.accent,
            lethal: this.fighterId === "hypersonic",
            reflect: false,
          });
        }
        state.laserHeat = Math.min(100, state.laserHeat + pending.heat * assault.heatMultiplier);
        if (state.laserHeat >= 98) state.laserCooldown = pending.overheatCooldown;
        state.shake = Math.max(state.shake, pending.width > 7 ? 7 : 3);
        this.play("laserBeam");
      }
    }
    for (let index = state.laserBeams.length - 1; index >= 0; index -= 1) {
      const beam = state.laserBeams[index];
      beam.life -= dt;
      this.damageWithLaser(beam, dt);
      if (beam.life <= 0) state.laserBeams.splice(index, 1);
    }
  }

  laserSegments(beam) {
    const origin = { x: this.state.player.x + beam.offsetX, y: this.state.player.y + (beam.offsetY ?? -24) };
    const angle = beam.angle || 0;
    const end = { x: origin.x + Math.sin(angle) * this.height, y: origin.y - Math.cos(angle) * this.height };
    return [{ x1: origin.x, y1: origin.y, x2: end.x, y2: end.y }];
  }

  damageWithLaser(beam, dt) {
    const state = this.state;
    const segments = this.laserSegments(beam);
    for (let index = state.entities.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = state.entities.enemies[index];
      if (!segments.some((segment) => distanceToSegment(enemy.x, enemy.y, segment) <= enemy.radius + beam.width)) continue;
      enemy.health -= beam.lethal ? Math.max(enemy.health, beam.damagePerSecond * dt) : beam.damagePerSecond * dt;
      enemy.hitFlash = 0.08;
      if (this.fighterId === "rafale" && state.upgrades.includes("resonance-arc")) this.splashDamage(enemy.x, enemy.y, beam.damagePerSecond * dt * 0.28, 72, enemy.id);
      if (enemy.health <= 0) this.killEnemy(index);
    }
    if (state.boss) {
      const boss = state.boss;
      if (segments.some((segment) => distanceToSegment(boss.x, boss.y, segment) <= boss.radius + beam.width)) {
        const multiplier = beam.lethal ? 2.35 : 1;
        this.damageBoss(beam.damagePerSecond * dt * multiplier, state.player.x < boss.x ? "left" : "right");
      }
    }
    for (const structure of state.mapStructures) {
      if (!structure.breakable || structure.destroyed) continue;
      const center = { x: structure.x + structure.width / 2, y: structure.y + structure.height / 2 };
      if (!segments.some((segment) => distanceToSegment(center.x, center.y, segment) <= Math.max(structure.width, structure.height) * 0.5)) continue;
      this.damageStructure(structure, beam.damagePerSecond * dt * 0.8);
    }
    for (let index = state.entities.meteors.length - 1; index >= 0; index -= 1) {
      const meteor = state.entities.meteors[index];
      if (!segments.some((segment) => distanceToSegment(meteor.x, meteor.y, segment) <= meteor.radius + beam.width)) continue;
      this.damageMeteor(index, beam.damagePerSecond * dt * 1.4, true);
    }
    if (state.mission?.id === "mothership") {
      for (const part of state.mission.parts) {
        if (!part.destroyed && segments.some((segment) => distanceToSegment(part.x, part.y, segment) <= part.radius + beam.width)) this.damageMissionPart(part, beam.damagePerSecond * dt * 1.25);
      }
    }
  }

  updateNuclear(dt) {
    const nuclear = this.state.nuclear;
    if (!nuclear) return;
    nuclear.timer -= dt;
    if (nuclear.timer > 0) return;
    for (let index = this.state.entities.enemies.length - 1; index >= 0; index -= 1) this.killEnemy(index, true);
    this.clearEntityKind("enemyProjectiles");
    if (this.state.boss) {
      this.damageBoss(96, "left");
      this.damageBoss(96, "right");
    }
    if (this.state.upgrades.includes("hyper-array") && this.state.formChain >= 5) {
      for (const angle of [-0.18, 0, 0.18]) this.spawnPlayerProjectile({ x: this.state.player.x, y: this.state.player.y - 30, angle, speed: 1500, type: "rail", damage: this.fighter.damage * 12, radius: 9, pierce: 8, modifier: "hyper-chain" });
      this.state.formChain = 0;
    }
    this.state.flash = 1;
    this.state.shake = 22;
    this.state.slowMotion = 0.3;
    this.notify("核裁决引爆", "敌弹清空 // 普通敌机处决", 2.1);
    this.play("nuclearBlast");
    this.vibrate("heavy");
    this.state.nuclear = null;
  }

  spawnEnemy(type = null, x = null) {
    const state = this.state;
    const enemyType = type || enemyTypeForSpawn(state.elapsed, state.wave, ++state.spawnCount, this.random);
    const config = ENEMY_CONFIGS[enemyType] || ENEMY_CONFIGS.scout;
    const health = config.health(state.wave);
    return this.acquire("enemies", {
      id: state.nextEntityId++,
      type: enemyType,
      name: config.name,
      x: x ?? 32 + this.random() * (this.width - 64),
      y: -config.radius * 2,
      radius: config.radius,
      health,
      maxHealth: health,
      speed: config.speed * (1 + Math.min(1.8, state.wave * 0.07)),
      drift: (this.random() - 0.5) * config.drift,
      fireMode: config.fire,
      fireTimer: 0.55 + this.random() * 0.9,
      phase: this.random() * Math.PI * 2,
      score: config.score,
      color: config.color,
      hitFlash: 0,
      marked: false,
    });
  }

  updateEnemies(dt) {
    const state = this.state;
    if (state.boss || state.pendingMissionId || state.airdrop?.choiceOpen) return;
    const phase = combatPhase(state.elapsed);
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      const base = phase === "identify" ? 0.68 : phase === "learn" ? 0.54 : phase === "expand" ? 0.43 : 0.34;
      const density = state.difficulty * (state.recentHitTime > 0 ? 0.94 : 1);
      state.spawnTimer = Math.max(0.18, base / density - Math.min(0.16, state.wave * 0.01));
      this.spawnEnemy();
    }
    for (let index = state.entities.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = state.entities.enemies[index];
      enemy.y += enemy.speed * dt;
      enemy.x += (enemy.drift + Math.sin(state.elapsed * 1.8 + enemy.phase) * 18) * dt;
      enemy.x = clamp(enemy.x, enemy.radius, this.width - enemy.radius);
      for (const structure of state.mapStructures) {
        const resolved = resolveCircleFromStructure(enemy, structure);
        if (!resolved.collided) continue;
        enemy.x = clamp(resolved.x, enemy.radius, this.width - enemy.radius);
        enemy.y = resolved.y;
        enemy.drift *= -1;
      }
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
      enemy.fireTimer -= dt;
      if (state.elapsed >= 2 && enemy.fireTimer <= 0 && enemy.fireMode !== "none") {
        this.fireEnemyPattern(enemy);
        enemy.fireTimer = this.enemyFireInterval(enemy);
      }
      if (circlesOverlap(enemy, state.player)) {
        this.damagePlayer(enemy.x, enemy.y, Math.max(7, enemy.radius * 0.32));
        enemy.health = 0;
      }
      if (enemy.health <= 0) this.killEnemy(index);
      else if (enemy.y - enemy.radius > this.height + 20) this.releaseAt("enemies", index);
    }
  }

  enemyFireInterval(enemy) {
    const base = { aim: 1.25, fan: 1.4, snipe: 1.7, burst: 1.75, mine: 1.8, split: 1.55, strafe: 1.15, rocket: 1.65, elite: 1.15 }[enemy.fireMode] || 1.5;
    return Math.max(0.48, base / this.state.difficulty - this.state.wave * 0.018);
  }

  spawnEnemyProjectile({ x, y, angle = Math.PI, speed = 250, radius = 5, kind = "bolt", color = "#d64c45", delay = 0, damage = 12 }) {
    const budget = projectileBudget(this.state.elapsed, { boss: Boolean(this.state.boss) });
    if (this.state.entities.enemyProjectiles.length >= budget.enemy) return null;
    return this.acquire("enemyProjectiles", {
      id: this.state.nextEntityId++,
      x,
      y,
      radius,
      vx: Math.sin(angle) * speed,
      vy: -Math.cos(angle) * speed,
      speed,
      angle,
      kind,
      color,
      delay,
      age: 0,
      damage,
      grazed: false,
    });
  }

  aimedAngle(source, spread = 0) {
    const target = this.state.player;
    return Math.atan2(target.x - source.x, -(target.y - source.y)) + spread;
  }

  fireEnemyPattern(enemy) {
    const fire = (spread, count, speed, options = {}) => {
      const center = (count - 1) / 2;
      for (let index = 0; index < count; index += 1) this.spawnEnemyProjectile({
        x: enemy.x,
        y: enemy.y + enemy.radius * 0.6,
        angle: this.aimedAngle(enemy, (index - center) * spread),
        speed,
        ...options,
      });
    };
    if (enemy.fireMode === "aim") fire(0.12, 2, 250, { kind: "aim" });
    else if (enemy.fireMode === "fan") fire(0.15, 7, 220, { kind: "curve", color: "#d97a42" });
    else if (enemy.fireMode === "snipe") fire(0, 1, 430, { kind: "needle", radius: 3.5, color: "#2f7695" });
    else if (enemy.fireMode === "burst") fire(0.18, 5, 235, { kind: "shell", radius: 7, color: "#995676" });
    else if (enemy.fireMode === "mine") this.spawnEnemyProjectile({ x: enemy.x, y: enemy.y, speed: 65, angle: Math.PI, radius: 9, kind: "mine", delay: 1.1, color: "#8f6d43" });
    else if (enemy.fireMode === "split") fire(0.1, 3, 265, { kind: "split", radius: 5.5, color: "#b48c22" });
    else if (enemy.fireMode === "strafe") fire(0.08, 3, 360, { kind: "needle", radius: 3.8 });
    else if (enemy.fireMode === "rocket") fire(0.22, 2, 205, { kind: "rocket", radius: 6.5, color: "#477b4f" });
    else if (enemy.fireMode === "elite") {
      fire(0.16, 3, 290, { kind: "elite", radius: 5.5, color: "#c47b22" });
      if (this.random() < 0.35) this.fireRing(enemy, 9, 210, "#c47b22");
    }
    this.play("enemyFire", { mode: enemy.fireMode });
  }

  fireRing(source, count, speed, color) {
    for (let index = 0; index < count; index += 1) {
      const angle = index / count * Math.PI * 2;
      this.spawnEnemyProjectile({ x: source.x, y: source.y, angle, speed, radius: 4.8, kind: "ring", color });
    }
  }

  updateEnemyProjectiles(dt) {
    const state = this.state;
    for (let index = state.entities.enemyProjectiles.length - 1; index >= 0; index -= 1) {
      const bullet = state.entities.enemyProjectiles[index];
      bullet.age += dt;
      if (bullet.kind === "rocket") {
        const desired = this.aimedAngle(bullet);
        bullet.angle += clamp(desired - bullet.angle, -1.2 * dt, 1.2 * dt);
        bullet.vx = Math.sin(bullet.angle) * bullet.speed;
        bullet.vy = -Math.cos(bullet.angle) * bullet.speed;
      } else if (bullet.kind === "curve") {
        bullet.vx += Math.sin(bullet.age * 4 + bullet.id) * 18 * dt;
      } else if (bullet.kind === "mine" && bullet.age >= bullet.delay) {
        this.fireRing(bullet, 8, 190, bullet.color);
        this.releaseAt("enemyProjectiles", index);
        continue;
      }
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      const distance = Math.hypot(bullet.x - state.player.x, bullet.y - state.player.y);
      const grazeWindow = this.fighterId === "gripen" && state.upgrades.includes("graze-window") ? 25 : 18;
      if (!bullet.grazed && distance > bullet.radius + state.player.radius && distance <= bullet.radius + state.player.radius + grazeWindow) {
        bullet.grazed = true;
        state.score += 25 * state.combo;
        state.combo = Math.min(99, state.combo + 1);
        state.comboTimer = 2.2;
        state.grazeCount = (state.grazeCount || 0) + 1;
        if (this.fighterId === "gripen") state.overclockStacks = Math.min(12, (state.overclockStacks || 0) + 1);
        if (this.fighterId === "gripen" && state.grazeCount % 6 === 0) this.gainTransformCore(1, "擦弹超频");
        if (this.fighterId === "gripen" && state.upgrades.includes("graze-retaliate")) {
          const target = this.closestTarget(state.player.x, state.player.y, "pulse");
          if (target) this.spawnPlayerProjectile({ x: state.player.x, y: state.player.y - 18, angle: Math.atan2(target.x - state.player.x, -(target.y - state.player.y)), speed: 1050, type: "pulse", damage: this.fighter.damage * 1.4, modifier: "graze-overclock" });
        }
        this.play("graze");
      }
      const allyIndex = state.entities.allies.findIndex((ally) => circlesOverlap(bullet, ally));
      if (allyIndex >= 0) {
        const ally = state.entities.allies[allyIndex];
        ally.health -= bullet.damage;
        this.spawnParticles(ally.x, ally.y, 5, this.fighter.secondary);
        if (ally.health <= 0) state.entities.allies.splice(allyIndex, 1);
        this.releaseAt("enemyProjectiles", index);
        continue;
      }
      if (circlesOverlap(bullet, state.player)) {
        this.damagePlayer(bullet.x, bullet.y, bullet.damage);
        this.releaseAt("enemyProjectiles", index);
        continue;
      }
      if (state.airdrop?.phase === "escort" && circlesOverlap(bullet, state.airdrop.crate)) {
        state.airdrop.crate.health -= 4;
        this.releaseAt("enemyProjectiles", index);
        continue;
      }
      if (bullet.x < -40 || bullet.x > this.width + 40 || bullet.y < -80 || bullet.y > this.height + 60) this.releaseAt("enemyProjectiles", index);
    }
  }

  spawnBoss(wave = this.state.wave) {
    if (this.state.boss) return null;
    const spec = bossSpec(wave);
    this.state.boss = {
      ...spec,
      x: this.width / 2,
      y: 118,
      maxHealth: spec.health,
      phase: 1,
      fireTimer: 1,
      drift: 1,
      parts: {
        left: { health: spec.weaponHealth, maxHealth: spec.weaponHealth, destroyed: false },
        right: { health: spec.weaponHealth, maxHealth: spec.weaponHealth, destroyed: false },
      },
    };
    this.state.bossSpawnedWaves.push(wave);
    this.clearEntityKind("enemyProjectiles");
    this.notify("首领来袭", spec.name, 2.4);
    this.play("bossEnter");
    return this.state.boss;
  }

  updateBoss(dt) {
    const state = this.state;
    if (!state.boss && state.wave % 4 === 0 && !state.bossSpawnedWaves.includes(state.wave) && !state.mission && !state.pendingMissionId) this.spawnBoss(state.wave);
    const boss = state.boss;
    if (!boss) return;
    boss.x += boss.drift * 54 * dt;
    if (boss.x < boss.radius + 12 || boss.x > this.width - boss.radius - 12) boss.drift *= -1;
    boss.fireTimer -= dt;
    if (boss.fireTimer <= 0) {
      const leftActive = !boss.parts.left.destroyed;
      const rightActive = !boss.parts.right.destroyed;
      if (boss.phase === 1) {
        if (leftActive) this.fireBossFan(boss.x - 42, boss.y + 28, 5, 0.13, 240);
        if (rightActive) this.fireBossFan(boss.x + 42, boss.y + 28, 5, 0.13, 240);
      } else if (boss.phase === 2) {
        if (leftActive || rightActive) this.fireRing(boss, 12 - Number(!leftActive) * 3 - Number(!rightActive) * 3, 225, "#c47b22");
        this.fireBossFan(boss.x, boss.y + 30, 3, 0.09, 360);
      } else {
        this.fireBossFan(boss.x, boss.y + 34, 7 - Number(!leftActive) - Number(!rightActive), 0.12, 300);
        if (leftActive || rightActive) this.fireRing(boss, 15 - Number(!leftActive) * 4 - Number(!rightActive) * 4, 250, "#e64b45");
      }
      boss.fireTimer = Math.max(0.62, (1.45 - boss.phase * 0.18) / state.difficulty);
      this.play("bossFire", { phase: boss.phase });
    }
  }

  fireBossFan(x, y, count, spread, speed) {
    const source = { x, y };
    const center = (count - 1) / 2;
    for (let index = 0; index < count; index += 1) this.spawnEnemyProjectile({
      x,
      y,
      angle: this.aimedAngle(source, (index - center) * spread),
      speed,
      radius: 5.6,
      kind: "boss",
      color: "#d84643",
      damage: 15,
    });
  }

  damageBoss(amount, partKey = null) {
    const boss = this.state.boss;
    if (!boss) return false;
    if (partKey && boss.parts[partKey] && !boss.parts[partKey].destroyed) {
      const part = boss.parts[partKey];
      part.health -= amount * 0.42;
      if (part.health <= 0) {
        part.destroyed = true;
        part.health = 0;
        this.clearEntityKind("enemyProjectiles");
        this.spawnPickup(boss.x + (partKey === "left" ? -48 : 48), boss.y + 18, "core");
        this.notify(`${partKey === "left" ? "左侧" : "右侧"}武器舱熔毁`, "首领弹幕永久削弱", 2.2);
        this.play("bossPart");
        this.vibrate("heavy");
      }
    }
    boss.health -= amount;
    const ratio = boss.health / boss.maxHealth;
    const nextPhase = ratio <= 0.33 ? 3 : ratio <= 0.66 ? 2 : 1;
    if (nextPhase > boss.phase) {
      boss.phase = nextPhase;
      this.clearEntityKind("enemyProjectiles");
      this.state.flash = 0.65;
      this.notify(`首领阶段 ${nextPhase}`, nextPhase === 3 ? "核心暴走" : "装甲展开", 1.8);
      this.play("bossPhase", { phase: nextPhase });
    }
    if (boss.health <= 0) this.killBoss();
    return true;
  }

  killBoss() {
    const boss = this.state.boss;
    if (!boss) return;
    this.state.score += boss.score;
    this.state.kills += 1;
    this.state.transformCores = TRANSFORM_CORE_COST;
    this.state.wingmanCooldown = 0;
    this.state.player.health = Math.min(this.state.player.maxHealth, this.state.player.health + Math.round(this.state.player.maxHealth * 0.45));
    this.state.player.shieldCharges = Math.max(1, this.state.player.shieldCharges + 1);
    this.state.overdrive = 6;
    this.state.flash = 1;
    this.state.shake = 22;
    this.state.slowMotion = 0.3;
    this.state.bossDefeatFx = { x: boss.x, y: boss.y, timer: 0.36, burstTimer: 0, bursts: 0 };
    this.clearEntityKind("enemyProjectiles");
    this.state.boss = null;
    this.notify("首领击破", "能量补满 // 僚机就绪 // 极限火力 6 秒", 3);
    this.play("bossDefeat");
    this.vibrate("heavy");
  }

  updateBossDefeatFx(dt) {
    const effect = this.state.bossDefeatFx;
    if (!effect) return;
    effect.timer = Math.max(0, effect.timer - dt);
    effect.burstTimer -= dt;
    while (effect.bursts < 3 && effect.burstTimer <= 0) {
      const offset = [-48, 0, 48][effect.bursts];
      this.spawnParticles(effect.x + offset, effect.y + (effect.bursts === 1 ? -12 : 16), 16, effect.bursts === 1 ? "#fff0b5" : "#ef6b55");
      effect.bursts += 1;
      effect.burstTimer += 0.1;
    }
    if (effect.timer <= 0 && effect.bursts >= 3) this.state.bossDefeatFx = null;
  }

  updatePlayerProjectiles(dt) {
    const state = this.state;
    for (let index = state.entities.playerProjectiles.length - 1; index >= 0; index -= 1) {
      const bullet = state.entities.playerProjectiles[index];
      bullet.age += dt;
      if (bullet.modifier === "graze-overclock" && state.overclockStacks > 0) bullet.vy = -Math.abs(bullet.speed * (1 + Math.min(0.35, state.overclockStacks * 0.035)));
      if (["seeker", "drone"].includes(bullet.type)) {
        const target = this.closestTarget(bullet.x, bullet.y, bullet.type);
        if (target) {
          const desired = Math.atan2(target.x - bullet.x, -(target.y - bullet.y));
          bullet.angle += clamp(desired - bullet.angle, -2.6 * dt, 2.6 * dt);
          bullet.vx = Math.sin(bullet.angle) * bullet.speed;
          bullet.vy = -Math.cos(bullet.angle) * bullet.speed;
        }
      }
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;

      if (this.hitMissionTarget(bullet)) {
        if (bullet.pierce > 0) bullet.pierce -= 1;
        else {
          this.releaseAt("playerProjectiles", index);
          continue;
        }
      }
      if (this.hitAirdropCarrier(bullet)) {
        this.releaseAt("playerProjectiles", index);
        continue;
      }
      let hit = false;
      for (let enemyIndex = state.entities.enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
        const enemy = state.entities.enemies[enemyIndex];
        if (!circlesOverlap(bullet, enemy)) continue;
        const damage = bullet.damage * (bullet.type === "heavy" ? 1.15 : 1);
        enemy.health -= damage;
        enemy.hitFlash = 0.06;
        this.hitFeedback(enemy.x, enemy.y, bullet.type === "heavy");
        if (["seeker", "drone"].includes(bullet.type)) {
          enemy.markStacks = (enemy.markStacks || 0) + 1;
          const markThreshold = this.fighterId === "j35" && state.upgrades.includes("falcon-lock") ? 1 : 2;
          enemy.marked = this.fighterId === "j35" ? enemy.markStacks >= markThreshold : true;
        }
        if (this.fighterId === "j20" && state.upgrades.includes("dragon-split") && ["seeker", "drone"].includes(bullet.type) && !bullet.split) {
          for (const angle of [-0.16, 0.16]) {
            const child = this.spawnPlayerProjectile({ x: enemy.x, y: enemy.y, angle, speed: 720, type: "pulse", damage: damage * 0.42, radius: 3, modifier: "command-lock" });
            if (child) child.split = true;
          }
        }
        if (this.fighterId === "typhoon" && bullet.type === "rail") {
          bullet.stormHits = (bullet.stormHits || 0) + 1;
          if (bullet.stormHits >= 2) {
            state.stormPierceHits = (state.stormPierceHits || 0) + 1;
            state.score += 20 * bullet.stormHits;
            state.combo = Math.min(99, state.combo + 1);
            state.comboTimer = 2.2;
            if (state.upgrades.includes("storm-chain")) bullet.damage *= 1.18;
            if (state.upgrades.includes("storm-refund")) state.passiveTimer = Math.max(0, state.passiveTimer - 0.28);
          }
        }
        if (this.fighterId === "rafale" && bullet.type === "wave") {
          enemy.resonance = (enemy.resonance || 0) + 1;
          const threshold = state.upgrades.includes("resonance-fast") ? 4 : 5;
          if (enemy.resonance >= threshold) {
            enemy.resonance = 0;
            this.splashDamage(enemy.x, enemy.y, damage * 0.8, 86, enemy.id);
            this.spawnParticles(enemy.x, enemy.y, 14, this.fighter.secondary);
            if (state.upgrades.includes("resonance-chain")) state.entities.enemies.forEach((nearby) => {
              if (nearby.id !== enemy.id && Math.hypot(nearby.x - enemy.x, nearby.y - enemy.y) <= 100) nearby.resonance = (nearby.resonance || 0) + 1;
            });
          }
        }
        if (bullet.type === "heavy") this.splashDamage(enemy.x, enemy.y, damage * 0.55, 62, enemy.id);
        if (enemy.health <= 0) this.killEnemy(enemyIndex);
        hit = true;
        if (bullet.pierce > 0) bullet.pierce -= 1;
        else break;
      }
      if (state.boss && circlesOverlap(bullet, state.boss)) {
        const partKey = bullet.x < state.boss.x ? "left" : "right";
        this.damageBoss(bullet.damage * (bullet.type === "heavy" ? 1.5 : 1), partKey);
        hit = true;
        if (bullet.pierce > 0) bullet.pierce -= 1;
      }
      const structure = state.mapStructures.find((item) => pointInsideStructure(bullet.x, bullet.y, item, bullet.radius));
      if (structure) {
        if (structure.breakable && ["heavy", "rail"].includes(bullet.type)) this.damageStructure(structure, bullet.damage * (bullet.type === "heavy" ? 2 : 1));
        hit = true;
      }
      let meteorHit = false;
      for (let meteorIndex = state.entities.meteors.length - 1; meteorIndex >= 0; meteorIndex -= 1) {
        const meteor = state.entities.meteors[meteorIndex];
        if (!circlesOverlap(bullet, meteor)) continue;
        const effective = ["heavy", "rail"].includes(bullet.type);
        this.damageMeteor(meteorIndex, bullet.damage * (effective ? 1.8 : 0.2), effective);
        meteorHit = true;
        break;
      }
      if ((hit || meteorHit) && bullet.pierce <= 0) {
        this.releaseAt("playerProjectiles", index);
        continue;
      }
      if (bullet.y < -80 || bullet.x < -80 || bullet.x > this.width + 80) this.releaseAt("playerProjectiles", index);
    }
  }

  closestTarget(x, y, projectileType = "") {
    const targets = [...this.state.entities.enemies, ...(this.state.boss ? [this.state.boss] : [])];
    return targets.sort((a, b) => {
      if (this.fighterId === "j20" && ["seeker", "drone"].includes(projectileType)) {
        const priority = (target) => target === this.state.boss ? 0 : target.type === "elite" ? 1 : 2;
        const delta = priority(a) - priority(b);
        if (delta) return delta;
      }
      return Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y);
    })[0] || null;
  }

  splashDamage(x, y, amount, radius, ignoredId) {
    for (let index = this.state.entities.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = this.state.entities.enemies[index];
      if (enemy.id === ignoredId || Math.hypot(enemy.x - x, enemy.y - y) > radius + enemy.radius) continue;
      enemy.health -= amount;
      if (enemy.health <= 0) this.killEnemy(index);
    }
  }

  hitFeedback(x, y, heavy = false) {
    this.state.hitStop = Math.max(this.state.hitStop, heavy ? 2 / 60 : 1 / 60);
    this.spawnParticles(x, y, heavy ? 8 : 3, heavy ? "#ffd35a" : this.fighter.accent);
    this.play("hit", { heavy });
  }

  killEnemy(index, forced = false) {
    const enemy = this.state.entities.enemies[index];
    if (!enemy) return;
    const gained = Math.round(enemy.score * Math.max(1, this.state.combo * 0.25));
    this.state.score += gained;
    this.state.kills += 1;
    this.state.combo = Math.min(99, this.state.combo + 1);
    this.state.maxCombo = Math.max(this.state.maxCombo, this.state.combo);
    this.state.comboTimer = 2.2;
    this.acquire("floatingTexts", { x: enemy.x, y: enemy.y, text: `+${gained}`, color: enemy.color, life: 0.8 });
    this.spawnParticles(enemy.x, enemy.y, 20, enemy.color);
    if (!forced) this.maybeDropPickup(enemy);
    if (enemy.type === "splitter" && !forced) {
      for (const offset of [-24, 24]) this.spawnEnemy("scout", clamp(enemy.x + offset, 20, this.width - 20));
    }
    if (!forced && enemy.marked && this.fighterId === "j20" && this.state.upgrades.includes("dragon-mark")) {
      const target = this.state.entities.enemies.find((candidate, candidateIndex) => candidateIndex !== index && Math.hypot(candidate.x - enemy.x, candidate.y - enemy.y) <= 150);
      if (target) target.marked = true;
    }
    if (!forced && enemy.marked && this.fighterId === "f22" && this.state.upgrades.includes("ghost-spread")) {
      const target = this.state.entities.enemies.find((candidate, candidateIndex) => candidateIndex !== index && !candidate.marked);
      if (target) target.marked = true;
    }
    if (!forced && enemy.marked && this.fighterId === "j35" && this.state.upgrades.includes("falcon-reset")) this.state.passiveTimer = Math.max(0, this.state.passiveTimer - 0.45);
    this.releaseAt("enemies", index);
    this.state.shake = Math.max(this.state.shake, enemy.type === "elite" ? 7 : 3);
    this.play("kill", { type: enemy.type });
    if (enemy.type === "elite") this.vibrate("light");
  }

  maybeDropPickup(enemy) {
    const kills = this.state.kills;
    let type = null;
    if (kills % 19 === 0) type = "evolution";
    else if (kills % 17 === 0) type = "ally";
    else if (kills % 13 === 0) type = "barrier";
    else if (kills % 11 === 0) type = "health";
    else if (kills % 7 === 0) type = "trajectory";
    else if (kills % 4 === 0 || enemy.type === "elite") type = "core";
    else if (this.random() < 0.035) type = ["core", "trajectory", "health"][Math.floor(this.random() * 3)];
    if (type) this.spawnPickup(enemy.x, enemy.y, type);
  }

  spawnPickup(x, y, type = "core") {
    return this.acquire("pickups", {
      id: this.state.nextEntityId++,
      type,
      x,
      y,
      radius: type === "barrier" ? 13 : 10,
      vy: 88,
      life: 12,
      color: PICKUP_COLORS[type] || PICKUP_COLORS.core,
      phase: this.random() * Math.PI * 2,
    });
  }

  updatePickups(dt) {
    const state = this.state;
    for (let index = state.entities.pickups.length - 1; index >= 0; index -= 1) {
      const pickup = state.entities.pickups[index];
      pickup.life -= dt;
      pickup.y += pickup.vy * dt;
      pickup.x += Math.sin(state.elapsed * 4 + pickup.phase) * 22 * dt;
      const magnet = Math.hypot(pickup.x - state.player.x, pickup.y - state.player.y) <= this.fighter.pickupRadius;
      if (magnet) {
        pickup.x += (state.player.x - pickup.x) * Math.min(1, dt * 6);
        pickup.y += (state.player.y - pickup.y) * Math.min(1, dt * 6);
      }
      if (circlesOverlap(pickup, state.player, 4)) {
        this.collectPickup(pickup.type);
        this.releaseAt("pickups", index);
      } else if (pickup.life <= 0 || pickup.y > this.height + 30) this.releaseAt("pickups", index);
    }
  }

  collectPickup(type) {
    const state = this.state;
    if (type === "core") this.gainTransformCore(1, "红球");
    else if (type === "evolution") {
      state.evolution += 1;
      if (state.evolution % 2 === 0) state.weaponLevel = Math.min(5, state.weaponLevel + 1);
      state.pendingUpgrade = true;
      this.signal("upgradeChoice", { choices: fighterUpgradeChoices(this.fighterId, state.upgrades) });
    } else if (type === "trajectory") {
      if (state.weaponLevel >= 5) state.trajectoryLevel = 0;
      else state.trajectoryLevel += 1;
      if (state.trajectoryLevel >= 3) {
        state.weaponLevel += 1;
        state.trajectoryLevel = 0;
      }
    } else if (type === "health") {
      state.player.health = Math.min(state.player.maxHealth, state.player.health + Math.round(state.player.maxHealth * 0.3));
      state.player.shieldCharges = Math.min(4, state.player.shieldCharges + 1);
    } else if (type === "barrier") state.barrierTime = Math.max(state.barrierTime, 8);
    else if (type === "ally") this.spawnFriendlyAllies();
    else if (type === "meteor-core") {
      if (state.transformCores < TRANSFORM_CORE_COST) this.gainTransformCore(1, "陨星核心");
      else state.firepowerTime = Math.max(state.firepowerTime, 5);
    }
    this.notify("补给获得", PICKUP_LABELS[type] || type, 1.8);
    this.play("pickup", { type });
    if (["barrier", "ally", "meteor-core"].includes(type)) this.vibrate("light");
  }

  gainTransformCore(amount = 1, source = "能量球") {
    const before = this.state.transformCores;
    this.state.transformCores = Math.min(TRANSFORM_CORE_COST, before + amount);
    if (before < TRANSFORM_CORE_COST && this.state.transformCores >= TRANSFORM_CORE_COST && !this.state.transformed) {
      this.state.transformReadyAnnounced = true;
      this.signal("transformReady", { text: "能量已满，点击变身" });
      this.notify("能量已满", "点击右侧“变身”启动 10 秒强袭", 3.2);
      this.play("transformReady", { source });
    }
  }

  spawnFriendlyAllies() {
    const existing = this.state.entities.allies.filter((ally) => ally.source === "pickup").length;
    const count = Math.min(2, 4 - existing);
    for (let index = 0; index < count; index += 1) this.state.entities.allies.push({
      id: `ally-${this.state.nextEntityId++}`,
      source: "pickup",
      index,
      count,
      x: this.state.player.x,
      y: this.state.player.y,
      radius: 12,
      health: 48,
      maxHealth: 48,
      duration: Infinity,
      fireTimer: index * 0.1,
      projectile: "pulse",
      rate: 0.28,
      speed: 900,
      damage: 1.15,
      formation: "escort",
    });
  }

  updateAllies(dt) {
    const allies = this.state.entities.allies;
    for (let index = allies.length - 1; index >= 0; index -= 1) {
      const ally = allies[index];
      if (Number.isFinite(ally.duration)) ally.duration -= dt;
      const slot = ally.index - (ally.count - 1) / 2;
      const orbit = ally.formation === "orbit" || ally.formation === "halo";
      const targetX = orbit
        ? this.state.player.x + Math.cos(this.state.elapsed * 2.2 + ally.index * 2) * 48
        : this.state.player.x + slot * 42;
      const targetY = orbit
        ? this.state.player.y + Math.sin(this.state.elapsed * 2.2 + ally.index * 2) * 32
        : this.state.player.y + 22 + Math.abs(slot) * 10;
      ally.x += (targetX - ally.x) * Math.min(1, dt * 7);
      ally.y += (targetY - ally.y) * Math.min(1, dt * 7);
      ally.fireTimer -= dt;
      if (ally.fireTimer <= 0) {
        ally.fireTimer = ally.rate;
        const copiedMode = this.fighterId === "faxx" ? toolModeSpec(this.fighterId, this.state.toolModeIndex) : null;
        const projectile = copiedMode?.pattern || ally.projectile;
        const focus = this.fighterId === "faxx" && this.state.upgrades.includes("falcon-focus") ? 1.28 : 1;
        this.spawnPlayerProjectile({
          x: ally.x,
          y: ally.y - 12,
          speed: copiedMode?.speed || ally.speed,
          type: projectile,
          damage: ally.damage * (copiedMode?.damage || 1) * focus,
          radius: projectile === "heavy" ? 6 : 3.8,
          pierce: projectile === "rail" ? 1 : 0,
          modifier: this.fighterId === "faxx" && this.state.upgrades.includes("falcon-copy") ? "drone-formation" : "",
        });
      }
      if (ally.health <= 0 || ally.duration <= 0) allies.splice(index, 1);
    }
  }

  damagePlayer(x, y, amount = 12) {
    const state = this.state;
    if (state.player.invulnerable > 0 || state.ended) return false;
    if (state.barrierTime > 0) {
      state.shake = Math.max(state.shake, 3);
      this.play("barrierBlock");
      return false;
    }
    if (state.player.shieldCharges > 0) {
      state.player.shieldCharges -= 1;
      state.player.invulnerable = 0.6;
      state.shake = 6;
      this.notify("护盾破裂", `剩余 ${state.player.shieldCharges} 层`, 1.2);
      this.play("shieldBreak");
      this.vibrate("light");
      if (this.fighterId === "su57" && state.upgrades.includes("armor-charge")) state.counterCharge = Math.min(5, (state.counterCharge || 0) + 1);
      return false;
    }
    const armorMultiplier = state.transformed ? 0.55 : 1 - this.fighter.stats.armor / 500;
    state.player.health -= Math.max(1, amount * armorMultiplier);
    state.player.invulnerable = 0.7;
    state.recentHitTime = 4;
    state.combo = 1;
    state.shake = 10;
    state.flash = 0.3;
    this.spawnParticles(x, y, 12, "#e34c43");
    this.play("playerHit");
    this.vibrate("heavy");
    if (this.fighterId === "su57") state.counterCharge = Math.min(5, (state.counterCharge || 0) + 1);
    if (this.fighterId === "gripen") state.overclockStacks = Math.max(0, (state.overclockStacks || 0) - (state.upgrades.includes("graze-keep") ? 2 : 4));
    if (this.fighterId === "gripen") state.overclockStacks = Math.max(0, (state.overclockStacks || 0) - (state.upgrades.includes("graze-keep") ? 2 : 4));
    if (state.player.health <= 0) this.endCombat();
    return true;
  }

  endCombat() {
    const state = this.state;
    state.player.health = 0;
    state.running = false;
    state.ended = true;
    const laserShots = state.toolModes.filter((mode, index) => mode.pattern === "laser" && index === state.toolModeIndex).length + (state.laserHeat > 0 ? 1 : 0);
    const style = state.grazeCount >= 8 ? "擦弹机动流" : laserShots ? "激光处决流" : (state.formUses || 0) >= 4 ? "多形态弹幕流" : "稳健火力流";
    state.result = {
      score: Math.round(state.score),
      wave: state.wave,
      maxCombo: state.maxCombo,
      kills: state.kills,
      fighterId: this.fighterId,
      style,
    };
    this.play("gameOver");
    this.signal("result", { result: state.result });
  }

  spawnParticles(x, y, count, color) {
    const available = Math.max(0, PARTICLE_LIMIT - this.state.entities.particles.length);
    const total = Math.min(count, available);
    for (let index = 0; index < total; index += 1) {
      const angle = this.random() * Math.PI * 2;
      const speed = 50 + this.random() * 190;
      this.acquire("particles", {
        x,
        y,
        radius: 1.5 + this.random() * 2.8,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.3 + this.random() * 0.55,
        maxLife: 0.85,
        color,
      });
    }
  }

  updateParticles(dt) {
    for (let index = this.state.entities.particles.length - 1; index >= 0; index -= 1) {
      const particle = this.state.entities.particles[index];
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.97;
      particle.vy *= 0.97;
      particle.life -= dt;
      if (particle.life <= 0) this.releaseAt("particles", index);
    }
  }

  updateMap(dt) {
    const state = this.state;
    const cycle = this.height * 4.45;
    for (const structure of state.mapStructures) {
      structure.y += (this.map.structureSpeed + Math.min(28, state.wave * 2.1)) * dt;
      if (structure.vx) {
        structure.x += structure.vx * dt;
        const travel = Math.min(76, this.width * 0.14);
        if (structure.x < structure.originX - travel || structure.x > structure.originX + travel) structure.vx *= -1;
      }
      if (structure.forcedOpen > 0) structure.forcedOpen = Math.max(0, structure.forcedOpen - dt);
      if (structure.gateCycle) {
        const idParts = structure.id.split("-");
        const phase = (state.elapsed + Number(idParts[idParts.length - 1]) * 0.47) % structure.gateCycle;
        structure.open = structure.forcedOpen > 0 || phase < structure.gateOpenFor;
      }
      if (structure.y > this.height + 90) {
        structure.y -= cycle;
        structure.x = structure.originX;
        structure.destroyed = false;
        structure.health = structure.maxHp;
        structure.hp = structure.maxHp;
        structure.open = false;
      }
      if (pointInsideHazard(state.player.x, state.player.y, structure, state.player.radius * 0.35) && state.dangerTick <= 0) {
        state.dangerTick = 0.55;
        this.damagePlayer(state.player.x, state.player.y, 8);
      }
    }
    state.mapEventTimer -= dt;
    if (state.mapEventTimer <= 0 && !state.boss) {
      this.triggerMapEvent();
      state.mapEventTimer = 18 + this.random() * 8;
    }
  }

  damageStructure(structure, amount) {
    if (!structure?.breakable || structure.destroyed) return false;
    structure.hp -= amount;
    if (structure.hp > 0) return false;
    structure.destroyed = true;
    this.state.score += 900;
    this.notify("隐藏航路已开启", "可破坏结构已清除", 1.6);
    this.play("structureBreak");
    return true;
  }

  triggerMapEvent() {
    const state = this.state;
    if (this.map.event === "lightning") {
      for (let index = state.entities.enemyProjectiles.length - 1; index >= 0; index -= 3) this.releaseAt("enemyProjectiles", index);
      state.entities.enemies.forEach((enemy) => { enemy.health -= 5; });
      this.notify("雷暴链", "部分敌弹被清除", 1.8);
    } else if (this.map.event === "aurora") {
      state.entities.enemyProjectiles.forEach((bullet) => { bullet.vx *= 0.5; bullet.vy *= 0.5; });
      this.notify("极光冻结", "敌方弹道减速", 1.8);
    } else if (this.map.event === "phase") {
      state.mapStructures.filter((structure) => structure.kind === "gate").forEach((structure) => { structure.forcedOpen = 3; });
      this.notify("相位窗口", "能源门开放 3 秒", 1.8);
    } else if (this.map.event === "meteor") {
      this.spawnMeteorWarning(true);
      this.notify("陨星风暴", "大型陨石进入轨道", 1.8);
    } else {
      state.airdropTimer = Math.min(state.airdropTimer, 5);
      this.notify("雷达支援", "战术空投即将抵达", 1.8);
    }
    this.play("mapEvent", { event: this.map.event });
  }

  spawnMeteorWarning(large = false) {
    const x = 40 + this.random() * (this.width - 80);
    const y = this.height * (0.25 + this.random() * 0.48);
    this.state.entities.meteorWarnings.push({ id: this.state.nextEntityId++, x, y, radius: large ? 62 : 38, life: large ? 1.8 : 1.3, maxLife: large ? 1.8 : 1.3, large });
    this.play("meteorWarning", { large });
  }

  updateMeteors(dt) {
    const state = this.state;
    if (!state.boss) state.meteorTimer -= dt;
    if (!state.boss && state.meteorTimer <= 0) {
      this.spawnMeteorWarning(this.mapId === "meteor-rift" && this.random() < 0.35);
      state.meteorTimer = (this.mapId === "meteor-rift" ? 7 : 18) + this.random() * 7;
    }
    for (let index = state.entities.meteorWarnings.length - 1; index >= 0; index -= 1) {
      const warning = state.entities.meteorWarnings[index];
      warning.life -= dt;
      if (warning.life > 0) continue;
      state.entities.meteorWarnings.splice(index, 1);
      const startX = warning.x - 120;
      this.acquire("meteors", {
        id: state.nextEntityId++,
        x: startX,
        y: -80,
        targetX: warning.x,
        targetY: warning.y,
        radius: warning.large ? 36 : 22,
        health: warning.large ? 58 : 18,
        maxHealth: warning.large ? 58 : 18,
        vx: 115,
        vy: 240,
        large: warning.large,
        color: warning.large ? "#a94f40" : "#7f5d52",
      });
    }
    for (let index = state.entities.meteors.length - 1; index >= 0; index -= 1) {
      const meteor = state.entities.meteors[index];
      meteor.x += meteor.vx * dt;
      meteor.y += meteor.vy * dt;
      if (circlesOverlap(meteor, state.player)) {
        this.damagePlayer(meteor.x, meteor.y, meteor.large ? 28 : 18);
        this.impactMeteor(index);
        continue;
      }
      if (meteor.y >= meteor.targetY) this.impactMeteor(index);
    }
  }

  damageMeteor(index, amount, effective = false) {
    const meteor = this.state.entities.meteors[index];
    if (!meteor) return false;
    if (meteor.large && !effective) return false;
    meteor.health -= amount;
    if (meteor.health > 0) return false;
    const x = meteor.x;
    const y = meteor.y;
    const large = meteor.large;
    this.releaseAt("meteors", index);
    this.state.score += large ? 1200 : 420;
    if (large) this.spawnPickup(x, y, "meteor-core");
    this.spawnParticles(x, y, large ? 34 : 20, "#c95f48");
    this.notify(large ? "大型陨石击碎" : "陨石击碎", large ? "陨星核心已掉落" : "+420", 1.6);
    this.play("meteorBreak", { large });
    return true;
  }

  impactMeteor(index) {
    const meteor = this.state.entities.meteors[index];
    if (!meteor) return;
    const { x, y, large } = meteor;
    const radius = large ? 112 : 72;
    this.releaseAt("meteors", index);
    for (let enemyIndex = this.state.entities.enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
      const enemy = this.state.entities.enemies[enemyIndex];
      if (Math.hypot(enemy.x - x, enemy.y - y) <= radius + enemy.radius) {
        enemy.health -= large ? 90 : 32;
        if (enemy.health <= 0) this.killEnemy(enemyIndex);
      }
    }
    if (this.state.boss && Math.hypot(this.state.boss.x - x, this.state.boss.y - y) <= radius + this.state.boss.radius) this.damageBoss(large ? 42 : 18);
    for (const structure of this.state.mapStructures) {
      if (!structure.breakable || structure.destroyed) continue;
      const centerX = structure.x + structure.width / 2;
      const centerY = structure.y + structure.height / 2;
      if (Math.hypot(centerX - x, centerY - y) <= radius + Math.max(structure.width, structure.height) * 0.5) this.damageStructure(structure, large ? 64 : 20);
    }
    this.state.shake = Math.max(this.state.shake, large ? 20 : 12);
    this.spawnParticles(x, y, large ? 44 : 28, "#a94f40");
    this.play("meteorImpact", { large });
  }

  spawnAirdropCarrier() {
    this.state.airdrop = {
      phase: "carrier",
      carrier: { x: this.width / 2, y: -48, radius: 30, health: 34, maxHealth: 34, vy: 62 },
      crate: null,
      choiceOpen: false,
    };
    this.notify("战术空投进入", "击落运输机获取特殊奖励", 2.2);
    this.play("airdropIncoming");
  }

  updateAirdrop(dt) {
    const state = this.state;
    if (!state.airdrop && !state.boss) state.airdropTimer -= dt;
    if (!state.airdrop && !state.boss && state.airdropTimer <= 0) this.spawnAirdropCarrier();
    const drop = state.airdrop;
    if (!drop) return;
    if (drop.phase === "carrier") {
      drop.carrier.y += drop.carrier.vy * dt;
      drop.carrier.x = this.width / 2 + Math.sin(state.elapsed * 1.2) * this.width * 0.26;
      if (drop.carrier.y > this.height * 0.44) {
        state.airdrop = null;
        state.airdropTimer = 22;
        this.notify("空投运输机脱离", "本次未能击落", 1.6);
      }
    } else if (drop.phase === "crate") {
      drop.crate.y = Math.min(drop.crate.targetY, drop.crate.y + 150 * dt);
      if (drop.crate.y >= drop.crate.targetY) drop.phase = "ready";
    } else if (drop.phase === "ready") {
      if (!drop.choiceOpen && Math.hypot(state.player.x - drop.crate.x, state.player.y - drop.crate.y) <= drop.crate.radius + 54) {
        drop.choiceOpen = true;
        this.signal("airdropChoice", { upgraded: false });
      }
    } else if (drop.phase === "escort") {
      const inside = Math.hypot(state.player.x - drop.crate.x, state.player.y - drop.crate.y) <= drop.crate.escortRadius;
      drop.crate.playerInside = inside;
      if (inside) drop.crate.escortTime += dt;
      drop.crate.attackTimer -= dt;
      if (drop.crate.attackTimer <= 0 && state.entities.enemies.length) {
        drop.crate.attackTimer = 1.2;
        drop.crate.health -= 3 + Math.floor(state.wave / 4);
      }
      if (drop.crate.health <= 0) {
        this.notify("护送失败", "补给箱损毁", 2);
        this.play("airdropFail");
        state.airdrop = null;
        state.airdropTimer = 35;
      } else if (drop.crate.escortTime >= AIRDROP_ESCORT_DURATION) {
        drop.phase = "ready";
        drop.upgraded = true;
        drop.choiceOpen = true;
        this.clearEntityKind("enemyProjectiles");
        this.notify("护送成功", "高级补给已解锁", 2);
        this.play("airdropUpgrade");
        this.signal("airdropChoice", { upgraded: true });
      }
    }
  }

  hitAirdropCarrier(bullet) {
    const drop = this.state.airdrop;
    if (drop?.phase !== "carrier" || !circlesOverlap(bullet, drop.carrier)) return false;
    drop.carrier.health -= bullet.damage;
    if (drop.carrier.health <= 0) {
      drop.phase = "crate";
      drop.crate = {
        x: drop.carrier.x,
        y: drop.carrier.y,
        targetY: this.height * 0.56,
        radius: 24,
        escortRadius: 92,
        health: 44,
        maxHealth: 44,
        escortTime: 0,
        playerInside: false,
        attackTimer: 1.2,
      };
      drop.carrier = null;
      this.notify("运输机击落", "接近补给箱选择奖励或护送升级", 2.3);
      this.play("airdropLanded");
    }
    return true;
  }

  chooseAirdrop(choice) {
    const drop = this.state.airdrop;
    if (!drop || !["ready", "escort"].includes(drop.phase)) return false;
    if (choice === "escort" && !drop.upgraded) {
      drop.phase = "escort";
      drop.choiceOpen = false;
      drop.crate.escortTime = 0;
      this.notify("护送开始", `留在绿色范围 ${AIRDROP_ESCORT_DURATION} 秒`, 2);
      this.play("airdropEscort");
      return true;
    }
    const spec = airdropRewardSpec(choice, Boolean(drop.upgraded));
    if (spec.healthRatio) this.state.player.health = Math.min(this.state.player.maxHealth, this.state.player.health + this.state.player.maxHealth * spec.healthRatio);
    this.state.player.shieldCharges = Math.min(4, this.state.player.shieldCharges + spec.shieldCharges);
    this.state.firepowerTime = Math.max(this.state.firepowerTime, spec.firepowerDuration);
    this.state.trajectoryLevel += spec.trajectoryLevels;
    if (spec.wingmen && this.state.wingmanCooldown <= 0) this.summonWingman();
    this.notify(drop.upgraded ? "高级空投领取" : "战术空投领取", choice === "defense" ? "生存补给已生效" : "火力超载已生效", 2.2);
    this.play("airdropClaim", { choice, upgraded: Boolean(drop.upgraded) });
    this.state.airdrop = null;
    this.state.airdropTimer = 42;
    return true;
  }

  checkMissionSchedule() {
    const state = this.state;
    if (state.pendingMissionId || state.mission || state.boss || state.airdrop?.choiceOpen) return;
    const completed = [...state.completedMissions, ...state.skippedMissions];
    const next = nextMiniMission(state.elapsed, completed, false);
    if (!next) return;
    state.pendingMissionId = next.id;
    this.signal("missionPending", { mission: next });
    this.play("missionAlert");
  }

  clearForMission() {
    for (const kind of ["playerProjectiles", "enemyProjectiles", "enemies", "meteors"]) this.clearEntityKind(kind);
    this.state.laserBeams = [];
    this.state.pendingLaser = null;
    this.state.entities.meteorWarnings = [];
    this.state.boss = null;
    this.state.airdrop = null;
  }

  beginMission(missionId = this.state.pendingMissionId) {
    const spec = MINI_MISSIONS[missionId];
    if (!spec) return false;
    this.clearForMission();
    const mission = { id: missionId, title: spec.title, timer: spec.duration, duration: spec.duration, success: false };
    if (missionId === "coaster") {
      Object.assign(mission, { onTrack: 0, targetOnTrack: 8.5, segmentLabel: "弹射起步", laneX: this.width / 2, laneWidth: Math.min(230, this.width * 0.52), cameraRoll: 0, trackSpeed: 1 });
    } else if (missionId === "rings") {
      Object.assign(mission, { passed: 0, missed: 0, target: 5, ring: this.createMissionRing(0) });
    } else if (missionId === "carrier") {
      Object.assign(mission, { dockTime: 0, carrier: { x: this.width / 2, y: this.height + 120, targetY: this.height * 0.69, width: Math.min(410, this.width * 0.78), height: 190, deckWidth: Math.min(210, this.width * 0.48), deckHeight: 78 } });
    } else if (missionId === "mothership") {
      const centerX = this.width / 2;
      const y = Math.max(145, this.height * 0.24);
      Object.assign(mission, { parts: [
        { id: "mother-left", label: "左舷武器舱", x: centerX - Math.min(110, this.width * 0.23), y: y + 18, radius: 30, health: 40, maxHealth: 40, destroyed: false },
        { id: "mother-core", label: "中央反应堆", x: centerX, y: y - 8, radius: 34, health: 54, maxHealth: 54, destroyed: false },
        { id: "mother-right", label: "右舷武器舱", x: centerX + Math.min(110, this.width * 0.23), y: y + 18, radius: 30, health: 40, maxHealth: 40, destroyed: false },
      ] });
    } else if (missionId === "chain") {
      Object.assign(mission, { nodes: this.createChainNodes(), chainMax: 0, detonated: 0, chainRadius: 124 });
    }
    this.state.mission = mission;
    this.state.pendingMissionId = null;
    this.state.player.invulnerable = Math.max(this.state.player.invulnerable, 1);
    this.notify(`${spec.title} // 开始`, spec.objective, 2);
    this.play("missionStart", { id: missionId });
    return true;
  }

  skipMission(missionId = this.state.pendingMissionId) {
    if (!missionId || !MINI_MISSIONS[missionId]) return false;
    this.state.skippedMissions.push(missionId);
    this.state.missionResults.push({ id: missionId, success: false, detail: "本局跳过" });
    this.state.pendingMissionId = null;
    this.notify(`${MINI_MISSIONS[missionId].title} // 已跳过`, "返回主战场", 1.8);
    this.play("missionResult", { success: false });
    return true;
  }

  createMissionRing(index) {
    const radius = Math.max(36, Math.min(52, this.width * 0.11));
    const positions = [0.22, 0.72, 0.42, 0.8, 0.28];
    return { id: `ring-${index}`, x: radius + 20 + positions[index % positions.length] * (this.width - radius * 2 - 40), y: -radius, radius, speed: 245 + index * 18 };
  }

  createChainNodes() {
    const columns = 3;
    const gapX = Math.min(116, (this.width - 92) / 2);
    const gapY = Math.min(104, this.height * 0.13);
    const startX = this.width / 2 - gapX;
    const startY = Math.max(150, this.height * 0.22);
    return Array.from({ length: 9 }, (_, index) => ({
      id: `chain-${index}`,
      x: startX + (index % columns) * gapX + (Math.floor(index / columns) % 2 ? gapX * 0.18 : 0),
      y: startY + Math.floor(index / columns) * gapY,
      radius: 20,
      destroyed: false,
    }));
  }

  updateMission(dt) {
    const mission = this.state.mission;
    if (!mission) return;
    mission.timer -= dt;
    const progress = 1 - mission.timer / mission.duration;
    if (mission.id === "coaster") {
      const motion = coasterMotion(progress);
      mission.laneX = motion.center * this.width;
      mission.laneWidth = Math.min(230, this.width * 0.52) * motion.laneScale;
      mission.cameraRoll = motion.roll;
      mission.trackSpeed = motion.speed;
      mission.segmentLabel = motion.segmentLabel;
      if (Math.abs(this.state.player.x - mission.laneX) <= mission.laneWidth * 0.42) mission.onTrack += dt;
      if (mission.onTrack >= mission.targetOnTrack) this.finishMission(true, "轨道保持完成 // 极限火力 5 秒");
    } else if (mission.id === "rings") {
      mission.ring.y += mission.ring.speed * dt;
      if (ringContainsPlayer(this.state.player, mission.ring)) {
        mission.passed += 1;
        this.state.score += 300;
        this.play("ring");
        if (mission.passed >= mission.target) this.finishMission(true, "五环全连 // 能量球 +1");
        else mission.ring = this.createMissionRing(mission.passed);
      } else if (mission.ring.y - mission.ring.radius > this.height) {
        mission.missed += 1;
        mission.ring = this.createMissionRing(mission.passed + mission.missed);
      }
    } else if (mission.id === "carrier") {
      mission.carrier.y += (mission.carrier.targetY - mission.carrier.y) * Math.min(1, dt * 2.2);
      if (isInsideCarrierDeck(this.state.player, { ...mission.carrier, deckWidth: mission.carrier.deckWidth, deckHeight: mission.carrier.deckHeight })) mission.dockTime += dt;
      else mission.dockTime = Math.max(0, mission.dockTime - dt * 0.5);
      if (mission.dockTime >= 2) this.finishMission(true, "稳定停靠完成 // 战机整备完成");
    } else if (mission.id === "mothership" && mission.parts.every((part) => part.destroyed)) this.finishMission(true, "三处武器舱全部摧毁");
    else if (mission.id === "chain" && mission.chainMax >= 5) this.finishMission(true, `${mission.chainMax} 连爆 // 屏障 7 秒`);
    if (this.state.mission && mission.timer <= 0) this.finishMission(false, "挑战超时 // 返回主战场");
  }

  hitMissionTarget(bullet) {
    const mission = this.state.mission;
    if (!mission || !["mothership", "chain"].includes(mission.id)) return false;
    if (mission.id === "mothership") {
      const part = mission.parts.find((item) => !item.destroyed && circlesOverlap(bullet, item));
      if (!part) return false;
      this.damageMissionPart(part, bullet.damage * (bullet.type === "heavy" ? 1.8 : 1.2));
      return true;
    }
    const node = mission.nodes.find((item) => !item.destroyed && circlesOverlap(bullet, item));
    if (!node) return false;
    this.detonateChain(node.id);
    return true;
  }

  damageMissionPart(part, amount) {
    if (!part || part.destroyed) return false;
    part.health -= amount;
    if (part.health > 0) return false;
    part.health = 0;
    part.destroyed = true;
    this.state.score += 600;
    this.spawnParticles(part.x, part.y, 26, "#efb632");
    this.notify(`${part.label}摧毁`, "继续攻击剩余部件", 1.4);
    this.play("bossPart");
    return true;
  }

  detonateChain(nodeId) {
    const mission = this.state.mission;
    if (mission?.id !== "chain") return 0;
    const ids = connectedChain(mission.nodes, nodeId, mission.chainRadius);
    ids.forEach((id) => {
      const node = mission.nodes.find((item) => item.id === id);
      if (!node || node.destroyed) return;
      node.destroyed = true;
      mission.detonated += 1;
      this.spawnParticles(node.x, node.y, 18, "#ef724b");
    });
    mission.chainMax = Math.max(mission.chainMax, ids.length);
    this.state.shake = Math.min(18, 5 + ids.length * 1.5);
    this.notify("连锁爆破", `${ids.length} 连爆`, 1.4);
    this.play("chain", { count: ids.length });
    return ids.length;
  }

  finishMission(success, detail) {
    const mission = this.state.mission;
    if (!mission) return;
    if (success) {
      if (mission.id === "coaster") {
        this.state.score += 1000;
        this.state.overdrive = 5;
      } else if (mission.id === "rings") this.gainTransformCore(1, "穿环奖励");
      else if (mission.id === "carrier") {
        this.state.player.health = Math.min(this.state.player.maxHealth, this.state.player.health + this.state.player.maxHealth * 0.35);
        this.gainTransformCore(1, "航母补给");
        this.state.wingmanCooldown = 0;
        this.state.overdrive = 5;
      } else if (mission.id === "mothership") {
        this.state.score += 2400;
        this.state.transformCores = TRANSFORM_CORE_COST;
        this.clearEntityKind("enemyProjectiles");
      } else if (mission.id === "chain") {
        this.state.score += mission.chainMax * 250;
        this.state.barrierTime = 7;
      }
    }
    this.state.completedMissions.push(mission.id);
    this.state.missionResults.push({ id: mission.id, success, detail });
    this.state.mission = null;
    this.state.spawnTimer = 0.8;
    this.state.player.invulnerable = Math.max(this.state.player.invulnerable, 1.2);
    this.notify(success ? "副本完成" : "副本结束", detail, 2.5);
    this.play("missionResult", { success });
    this.signal("missionResult", { success, detail });
  }
}
