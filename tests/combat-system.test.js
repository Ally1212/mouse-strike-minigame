import { describe, expect, test } from "vitest";
import { FIGHTERS, FIGHTER_ORDER } from "../src/content/fighter-profiles.js";
import { toolModeSpec } from "../src/content/gameplay-rules.js";
import { fighterCombatScale, fighterWeaponOrigins } from "../src/content/fighter-geometry.js";
import { CombatSystem, x10TransformStage } from "../src/core/combat-system.js";
import { difficultyFromPerformance, ENEMY_ORDER } from "../src/core/enemy-config.js";
import { createCombatState } from "../src/core/game-state.js";
import { createRandom } from "../src/core/random.js";

function createSystem(fighterId = "j20", mapId = "usa", seed = 42) {
  const events = [];
  const combat = createCombatState(FIGHTERS[fighterId]);
  const system = new CombatSystem({
    combat,
    fighterId,
    mapId,
    width: 375,
    height: 812,
    random: createRandom(seed),
    emit: (event) => events.push(event),
  });
  return { system, combat, events };
}

describe("complete combat migration", () => {
  test("requires three cores and ends transformation after ten gameplay seconds", () => {
    const { system, combat } = createSystem();
    expect(system.tryTransform()).toBe(false);
    combat.transformCores = 3;
    expect(system.tryTransform()).toBe(true);
    expect(combat.transformCores).toBe(0);
    expect(combat.transformed).toBe(true);
    for (let index = 0; index < 100; index += 1) system.updateTransform(0.1);
    expect(combat.transformed).toBe(false);
    expect(combat.transformTime).toBe(0);
  });

  test("three collected cores announce readiness but never auto-transform", () => {
    const { system, combat, events } = createSystem();
    system.collectPickup("core");
    system.collectPickup("core");
    system.collectPickup("core");
    expect(combat.transformCores).toBe(3);
    expect(combat.transformed).toBe(false);
    for (let index = 0; index < 300; index += 1) system.update(1 / 60);
    expect(combat.transformCores).toBe(3);
    expect(combat.transformed).toBe(false);
    expect(events.some((event) => event.type === "transformReady")).toBe(true);
  });

  test("cycles three forms for normal fighters and ten for X-10", () => {
    for (const fighterId of FIGHTER_ORDER) {
      const { system, combat } = createSystem(fighterId);
      const expected = fighterId === "hypersonic" ? 10 : 3;
      const weaponLevel = combat.weaponLevel;
      for (let index = 0; index < expected; index += 1) system.cycleTool();
      expect(combat.toolModeIndex).toBe(0);
      expect(combat.toolModes).toHaveLength(expected);
      expect(combat.weaponLevel).toBe(weaponLevel);
    }
  });

  test("X-10 transform advances through four stages with distinct firepower", () => {
    expect([10, 7.5, 5, 2.5, 0].map(x10TransformStage)).toEqual([0, 1, 2, 3, 3]);
    const { system, combat } = createSystem("hypersonic");
    combat.transformed = true;
    combat.toolModeIndex = 1;
    combat.transformStage = 0;
    combat.fireTimer = 0;
    system.updatePlayerWeapons(1 / 60);
    const stageOne = { count: combat.entities.playerProjectiles.length, damage: combat.entities.playerProjectiles[0].damage };
    system.clearEntityKind("playerProjectiles");
    combat.transformStage = 3;
    combat.fireTimer = 0;
    system.updatePlayerWeapons(1 / 60);
    expect(combat.entities.playerProjectiles.length).toBeGreaterThan(stageOne.count);
    expect(combat.entities.playerProjectiles[0].damage).toBeGreaterThan(stageOne.damage);
  });

  test("starts with readable projectile density and automatically fires", () => {
    const { system, combat } = createSystem("gripen");
    let maximumPlayerProjectiles = 0;
    let maximumEnemyProjectiles = 0;
    for (let index = 0; index < 300; index += 1) {
      system.update(1 / 60);
      maximumPlayerProjectiles = Math.max(maximumPlayerProjectiles, combat.entities.playerProjectiles.length);
      maximumEnemyProjectiles = Math.max(maximumEnemyProjectiles, combat.entities.enemyProjectiles.length);
    }
    expect(maximumPlayerProjectiles).toBeGreaterThan(0);
    expect(maximumPlayerProjectiles).toBeLessThanOrEqual(18);
    expect(maximumEnemyProjectiles).toBeLessThanOrEqual(12);
  });

  test("main weapons launch from the aircraft hardpoints instead of the center", () => {
    const { system, combat } = createSystem("j20");
    combat.toolModeIndex = 0;
    combat.fireTimer = 0;
    system.updatePlayerWeapons(0);
    const expected = fighterWeaponOrigins(FIGHTERS.j20, combat.player.x, combat.player.y, fighterCombatScale(false), "seeker", combat.entities.playerProjectiles.length);
    expect(combat.entities.playerProjectiles.map(({ x, y }) => ({ x, y }))).toEqual(expected.map(({ x, y }) => ({ x, y })));
    expect(new Set(combat.entities.playerProjectiles.map((bullet) => bullet.x)).size).toBeGreaterThan(1);
  });

  test("non-homing player weapons keep a straight velocity while seekers may turn", () => {
    const straight = createSystem("rafale");
    const wave = straight.system.spawnPlayerProjectile({ x: 180, y: 600, angle: 0.12, speed: 700, type: "wave", damage: 1 });
    const initialVelocity = { vx: wave.vx, vy: wave.vy };
    straight.system.updatePlayerProjectiles(0.1);
    expect(wave.vx).toBeCloseTo(initialVelocity.vx, 8);
    expect(wave.vy).toBeCloseTo(initialVelocity.vy, 8);

    const homing = createSystem("j20");
    const target = homing.system.spawnEnemy("elite", 280);
    target.y = 260;
    const seeker = homing.system.spawnPlayerProjectile({ x: 100, y: 600, angle: 0, speed: 700, type: "seeker", damage: 1 });
    homing.system.updatePlayerProjectiles(0.1);
    expect(seeker.vx).not.toBe(0);
  });

  test("laser damage is effectively frame-rate independent", () => {
    function simulate(step) {
      const { system, combat } = createSystem("j20");
      combat.toolModeIndex = 1;
      combat.fireTimer = 99;
      const enemy = system.spawnEnemy("elite", combat.player.x);
      enemy.y = 220;
      enemy.speed = 0;
      enemy.health = 1000;
      enemy.maxHealth = 1000;
      system.startLaser(toolModeSpec("j20", 1));
      for (let elapsed = 0; elapsed < 1.3; elapsed += step) system.updateLasers(step);
      return 1000 - enemy.health;
    }
    const at30 = simulate(1 / 30);
    const at60 = simulate(1 / 60);
    expect(at30).toBeGreaterThan(0);
    expect(Math.abs(at30 - at60) / at60).toBeLessThan(0.06);
  });

  test("laser follows warmup, output, overheat and cooldown order", () => {
    const { system, combat, events } = createSystem("j20");
    combat.toolModeIndex = 1;
    const mode = toolModeSpec("j20", 1);
    expect(system.startLaser(mode)).toBe(true);
    expect(combat.laserWarmup).toBeGreaterThan(0);
    expect(combat.laserBeams).toHaveLength(0);
    system.updateLasers(combat.laserWarmup * 0.5);
    expect(combat.laserBeams).toHaveLength(0);
    system.updateLasers(combat.laserWarmup + 0.01);
    expect(combat.laserBeams.length).toBeGreaterThan(0);
    expect(combat.laserHeat).toBeGreaterThan(0);
    system.updateLasers(2);
    expect(combat.laserBeams).toHaveLength(0);
    combat.laserHeat = 99;
    expect(system.startLaser(mode)).toBe(false);
    expect(combat.laserCooldown).toBeGreaterThan(0);
    expect(events.some((event) => event.type === "sound" && event.name === "laserOverheat")).toBe(true);
    system.updateLasers(combat.laserCooldown + 0.1);
    expect(combat.laserCooldown).toBe(0);
    expect(combat.laserHeat).toBeLessThan(99);
  });

  test("laser breaks structures and large meteors that pulse fire cannot", () => {
    const { system, combat } = createSystem("j20");
    combat.toolModeIndex = 1;
    const structure = {
      id: "laser-wall",
      x: combat.player.x - 30,
      y: combat.player.y - 220,
      width: 60,
      height: 40,
      solid: true,
      breakable: true,
      hp: 4,
      maxHp: 4,
      destroyed: false,
    };
    combat.mapStructures = [structure];
    system.acquire("meteors", {
      id: 999,
      x: combat.player.x,
      y: combat.player.y - 150,
      radius: 36,
      health: 8,
      maxHealth: 8,
      large: true,
      color: "#a94f40",
    });
    expect(system.damageMeteor(0, 100, false)).toBe(false);
    expect(combat.entities.meteors[0].health).toBe(8);
    system.startLaser(toolModeSpec("j20", 1));
    system.updateLasers(1);
    expect(structure.destroyed).toBe(true);
    expect(combat.entities.meteors).toHaveLength(0);
    expect(combat.entities.pickups.some((pickup) => pickup.type === "meteor-core")).toBe(true);
  });

  test("X-10 nuclear strike clears regular enemies and damages the boss", () => {
    const { system, combat } = createSystem("hypersonic");
    system.spawnEnemy("scout", 100);
    system.spawnEnemy("elite", 240);
    system.spawnBoss(4);
    const bossHealth = combat.boss.health;
    expect(system.useSkill()).toBe(true);
    system.updateNuclear(1.3);
    expect(combat.entities.enemies).toHaveLength(0);
    expect(combat.entities.enemyProjectiles).toHaveLength(0);
    expect(combat.boss.health).toBeLessThan(bossHealth);
    expect(combat.skillCooldown).toBe(FIGHTERS.hypersonic.tactical.cooldown);
  });

  test("skills reject repeated use until cooldown completes", () => {
    const { system, combat } = createSystem("j35");
    expect(system.useSkill()).toBe(true);
    const firstCount = combat.entities.playerProjectiles.length;
    expect(system.useSkill()).toBe(false);
    expect(combat.entities.playerProjectiles).toHaveLength(firstCount);
    system.updateTimers(FIGHTERS.j35.tactical.cooldown);
    expect(combat.skillCooldown).toBe(0);
    expect(system.useSkill()).toBe(true);
  });

  test("all ten enemy types spawn with their own fire modes", () => {
    const { system, combat } = createSystem();
    const enemies = ENEMY_ORDER.map((type, index) => system.spawnEnemy(type, 25 + index * 32));
    expect(enemies.map((enemy) => enemy.type)).toEqual(ENEMY_ORDER);
    expect(new Set(enemies.map((enemy) => enemy.fireMode)).size).toBeGreaterThanOrEqual(9);
    expect(combat.entities.enemies).toHaveLength(10);
  });

  test("DDA lowers pressure after two deaths and raises it after three clears", () => {
    expect(difficultyFromPerformance({ current: 1, consecutiveDeaths: 2 })).toBeCloseTo(0.95);
    expect(difficultyFromPerformance({ current: 1, clearStreak: 3 })).toBeCloseTo(1.03);
    expect(difficultyFromPerformance({ current: 0.82, consecutiveDeaths: 8 })).toBe(0.82);
  });

  test("boss has three phases and destructible weapon bays", () => {
    const { system, combat } = createSystem();
    combat.player.health = 20;
    system.spawnBoss(4);
    expect(combat.boss.phase).toBe(1);
    system.damageBoss(300, "left");
    expect(combat.boss.phase).toBe(2);
    expect(combat.boss.parts.left.destroyed).toBe(true);
    system.damageBoss(100, "right");
    expect(combat.boss.phase).toBe(3);
    system.damageBoss(1000, "right");
    expect(combat.boss).toBeNull();
    expect(combat.transformCores).toBe(3);
    expect(combat.wingmanCooldown).toBe(0);
    expect(combat.overdrive).toBe(6);
    expect(combat.player.health).toBeGreaterThan(20);
    expect(combat.player.shieldCharges).toBeGreaterThanOrEqual(1);
    expect(combat.bossDefeatFx).toMatchObject({ bursts: 0 });
    system.updateBossDefeatFx(0.11);
    system.updateBossDefeatFx(0.11);
    system.updateBossDefeatFx(0.11);
    expect(combat.bossDefeatFx.bursts).toBe(3);
    expect(combat.entities.particles.length).toBeGreaterThanOrEqual(48);
  });

  test("spawns a boss on wave four and every four waves after that", () => {
    const { system, combat } = createSystem();
    combat.wave = 3;
    system.updateBoss(1 / 60);
    expect(combat.boss).toBeNull();
    combat.wave = 4;
    system.updateBoss(1 / 60);
    expect(combat.boss).not.toBeNull();
    system.damageBoss(99999);
    combat.bossDefeatFx = null;
    combat.wave = 8;
    system.updateBoss(1 / 60);
    expect(combat.boss).not.toBeNull();
  });

  test("six pickups and meteor core grant distinct rewards", () => {
    const { system, combat } = createSystem();
    system.collectPickup("core");
    expect(combat.transformCores).toBe(1);
    system.collectPickup("evolution");
    expect(combat.evolution).toBe(1);
    system.collectPickup("trajectory");
    expect(combat.trajectoryLevel).toBe(1);
    combat.player.health = 20;
    system.collectPickup("health");
    expect(combat.player.health).toBeGreaterThan(20);
    expect(combat.player.shieldCharges).toBe(1);
    system.collectPickup("barrier");
    expect(combat.barrierTime).toBe(8);
    system.collectPickup("ally");
    expect(combat.entities.allies.filter((ally) => ally.source === "pickup")).toHaveLength(2);
    combat.transformCores = 3;
    system.collectPickup("meteor-core");
    expect(combat.firepowerTime).toBe(5);
    combat.weaponLevel = 5;
    combat.trajectoryLevel = 0;
    for (let index = 0; index < 8; index += 1) system.collectPickup("trajectory");
    expect(combat.weaponLevel).toBe(5);
    expect(combat.trajectoryLevel).toBe(0);
  });

  test("active wingmen unlock at 15 seconds and keep independent health", () => {
    const { system, combat } = createSystem("faxx");
    expect(system.summonWingman()).toBe(false);
    combat.elapsed = 15;
    expect(system.summonWingman()).toBe(true);
    expect(combat.entities.allies).toHaveLength(3);
    expect(combat.entities.allies.every((ally) => ally.health > 0)).toBe(true);
    expect(combat.wingmanCooldown).toBe(FIGHTERS.faxx ? 22 : 0);
  });

  test("airdrop supports immediate rewards and six-second escort upgrade", () => {
    const { system, combat, events } = createSystem();
    system.spawnAirdropCarrier();
    const carrier = combat.airdrop.carrier;
    system.hitAirdropCarrier({ x: carrier.x, y: carrier.y, radius: 8, damage: 100 });
    combat.airdrop.crate.y = combat.airdrop.crate.targetY;
    combat.airdrop.phase = "ready";
    combat.player.x = combat.airdrop.crate.x;
    combat.player.y = combat.airdrop.crate.y;
    system.updateAirdrop(0.1);
    expect(events.some((event) => event.type === "airdropChoice")).toBe(true);
    expect(system.chooseAirdrop("escort")).toBe(true);
    for (let index = 0; index < 61; index += 1) system.updateAirdrop(0.1);
    expect(combat.airdrop.upgraded).toBe(true);
    expect(system.chooseAirdrop("firepower")).toBe(true);
    expect(combat.airdrop).toBeNull();
    expect(combat.firepowerTime).toBe(20);
  });

  test("airdrop escort failure grants no upgraded reward", () => {
    const { system, combat, events } = createSystem();
    system.spawnAirdropCarrier();
    const carrier = combat.airdrop.carrier;
    system.hitAirdropCarrier({ x: carrier.x, y: carrier.y, radius: 8, damage: 100 });
    combat.airdrop.phase = "ready";
    expect(system.chooseAirdrop("escort")).toBe(true);
    combat.airdrop.crate.health = 1;
    combat.airdrop.crate.attackTimer = 0;
    system.spawnEnemy("scout", 100);
    system.updateAirdrop(0.1);
    expect(combat.airdrop).toBeNull();
    expect(combat.firepowerTime).toBe(0);
    expect(events.some((event) => event.type === "sound" && event.name === "airdropFail")).toBe(true);
  });

  test("solid walls, gates, hazards and breakable structures have distinct collision rules", () => {
    const { system, combat } = createSystem();
    const wall = { id: "wall", x: 120, y: 220, width: 120, height: 80, solid: true, open: false, destroyed: false };
    combat.mapStructures = [wall];
    expect(system.movePlayer(180, 274)).toBe(false);
    expect(combat.player.x < wall.x || combat.player.x > wall.x + wall.width || combat.player.y < wall.y || combat.player.y > wall.y + wall.height).toBe(true);
    wall.open = true;
    expect(system.movePlayer(180, 274)).toBe(true);
    expect(combat.player.x).toBe(180);
    expect(combat.player.y).toBe(220);

    const health = combat.player.health;
    combat.player.invulnerable = 0;
    combat.dangerTick = 0;
    combat.mapStructures = [{ id: "hazard", x: 150, y: 190, width: 80, height: 80, solid: false, damage: 1, destroyed: false }];
    system.updateMap(0);
    expect(combat.player.health).toBeLessThan(health);
    expect(combat.player.x).toBe(180);
    expect(combat.player.y).toBe(220);

    const breakable = { id: "breakable", x: 0, y: 0, width: 60, height: 60, solid: true, breakable: true, hp: 5, maxHp: 5, destroyed: false };
    expect(system.damageStructure(breakable, 6)).toBe(true);
    expect(breakable.destroyed).toBe(true);
  });

  test("enemy aircraft cannot cross solid structures", () => {
    const { system, combat } = createSystem();
    const wall = { id: "wall", x: 120, y: 180, width: 120, height: 100, solid: true, open: false, destroyed: false };
    combat.mapStructures = [wall];
    combat.spawnTimer = 99;
    const enemy = system.spawnEnemy("fighter", 180);
    enemy.y = 220;
    enemy.speed = 0;
    system.updateEnemies(0);
    expect(enemy.x < wall.x || enemy.x > wall.x + wall.width || enemy.y < wall.y || enemy.y > wall.y + wall.height).toBe(true);
  });

  test("blue-ball allies take damage and disappear at zero health", () => {
    const { system, combat } = createSystem();
    system.spawnFriendlyAllies();
    const ally = combat.entities.allies[0];
    ally.x = 80;
    ally.y = 200;
    ally.health = 5;
    const bullet = system.spawnEnemyProjectile({ x: ally.x, y: ally.y, speed: 0, damage: 8 });
    bullet.vx = 0;
    bullet.vy = 0;
    system.updateEnemyProjectiles(0);
    expect(combat.entities.allies).toHaveLength(1);
    expect(combat.entities.enemyProjectiles).toHaveLength(0);
  });

  test("all nine fighter passives close their intended combat loops", () => {
    {
      const { system, combat } = createSystem("f22");
      const enemy = system.spawnEnemy("elite", 160);
      enemy.marked = true;
      system.useSkill();
      expect(combat.entities.enemies).toHaveLength(0);
    }
    {
      const { system } = createSystem("j35");
      const enemy = system.spawnEnemy("elite", 160);
      enemy.marked = true;
      const before = enemy.health;
      system.useSkill();
      expect(enemy.health).toBeLessThan(before);
    }
    {
      const { system, combat } = createSystem("typhoon");
      const first = system.spawnEnemy("elite", 180);
      const second = system.spawnEnemy("elite", 180);
      first.y = second.y = 260;
      first.health = second.health = 100;
      system.spawnPlayerProjectile({ x: 180, y: 260, speed: 0, type: "rail", damage: 1, pierce: 2 });
      system.updatePlayerProjectiles(0);
      expect(combat.stormPierceHits).toBeGreaterThan(0);
    }
    {
      const { system } = createSystem("rafale");
      const primary = system.spawnEnemy("elite", 160);
      const neighbor = system.spawnEnemy("elite", 220);
      primary.y = neighbor.y = 260;
      primary.health = neighbor.health = 100;
      for (let index = 0; index < 5; index += 1) {
        system.spawnPlayerProjectile({ x: primary.x, y: primary.y, speed: 0, type: "wave", damage: 1 });
        system.updatePlayerProjectiles(0);
      }
      expect(neighbor.health).toBeLessThan(100);
    }
    {
      const { system, combat } = createSystem("gripen");
      for (let index = 0; index < 6; index += 1) {
        const bullet = system.spawnEnemyProjectile({ x: combat.player.x + 33, y: combat.player.y, speed: 0, damage: 1 });
        bullet.vx = 0;
        bullet.vy = 0;
        system.updateEnemyProjectiles(0);
      }
      expect(combat.grazeCount).toBe(6);
      expect(combat.transformCores).toBe(1);
    }
    {
      const charged = createSystem("su57");
      charged.system.damagePlayer(0, 0, 10);
      expect(charged.combat.counterCharge).toBe(1);
      charged.system.useSkill();
      const chargedDamage = charged.combat.entities.playerProjectiles[0].damage;
      const baseline = createSystem("su57");
      baseline.system.useSkill();
      expect(chargedDamage).toBeGreaterThan(baseline.combat.entities.playerProjectiles[0].damage);
      expect(charged.combat.counterCharge).toBe(0);
    }
    {
      const { system } = createSystem("j20");
      const scout = system.spawnEnemy("scout", 180);
      scout.y = 300;
      const elite = system.spawnEnemy("elite", 40);
      elite.y = 100;
      expect(system.closestTarget(180, 500, "seeker")).toBe(elite);
      const boss = system.spawnBoss(4);
      expect(system.closestTarget(180, 500, "seeker")).toBe(boss);
    }
    {
      const { system, combat } = createSystem("faxx");
      combat.elapsed = 15;
      combat.toolModeIndex = 2;
      system.summonWingman();
      system.updateAllies(1);
      expect(combat.entities.playerProjectiles.some((projectile) => projectile.type === "rail")).toBe(true);
    }
    {
      const { system, combat } = createSystem("hypersonic");
      const enemy = system.spawnEnemy("elite", combat.player.x);
      enemy.y = combat.player.y - 180;
      enemy.health = 500;
      combat.toolModeIndex = 0;
      system.startLaser(toolModeSpec("hypersonic", 0));
      system.updateLasers(1);
      expect(combat.entities.enemies).toHaveLength(0);
    }
  });

  test("each of the five missions can complete and grant its own reward", () => {
    {
      const { system, combat } = createSystem();
      system.beginMission("coaster");
      for (let index = 0; index < 90 && combat.mission; index += 1) {
        combat.player.x = combat.mission.laneX;
        system.updateMission(0.1);
      }
      expect(combat.completedMissions).toContain("coaster");
      expect(combat.overdrive).toBe(5);
    }
    {
      const { system, combat } = createSystem();
      system.beginMission("rings");
      for (let index = 0; index < 5 && combat.mission; index += 1) {
        combat.player.x = combat.mission.ring.x;
        combat.player.y = combat.mission.ring.y;
        system.updateMission(0.01);
      }
      expect(combat.completedMissions).toContain("rings");
      expect(combat.transformCores).toBe(1);
    }
    {
      const { system, combat } = createSystem();
      system.beginMission("carrier");
      combat.mission.carrier.y = combat.mission.carrier.targetY;
      combat.player.x = combat.mission.carrier.x;
      combat.player.y = combat.mission.carrier.y;
      for (let index = 0; index < 21 && combat.mission; index += 1) system.updateMission(0.1);
      expect(combat.completedMissions).toContain("carrier");
      expect(combat.wingmanCooldown).toBe(0);
    }
    {
      const { system, combat } = createSystem();
      system.beginMission("mothership");
      [...combat.mission.parts].forEach((part) => system.damageMissionPart(part, 999));
      system.updateMission(0.01);
      expect(combat.completedMissions).toContain("mothership");
      expect(combat.transformCores).toBe(3);
    }
    {
      const { system, combat } = createSystem();
      system.beginMission("chain");
      system.detonateChain(combat.mission.nodes[0].id);
      system.updateMission(0.01);
      expect(combat.completedMissions).toContain("chain");
      expect(combat.barrierTime).toBe(7);
    }
  });

  test("missions can fail or be skipped without blocking the main battle", () => {
    const { system, combat } = createSystem();
    system.beginMission("rings");
    combat.mission.timer = 0;
    system.updateMission(0.1);
    expect(combat.mission).toBeNull();
    expect(combat.missionResults.at(-1)).toMatchObject({ id: "rings", success: false });
    combat.pendingMissionId = "carrier";
    expect(system.skipMission()).toBe(true);
    expect(combat.skippedMissions).toContain("carrier");
    expect(combat.pendingMissionId).toBeNull();
  });

  test("meteor impacts can open breakable map routes", () => {
    const { system, combat } = createSystem();
    const structure = { id: "route", x: 150, y: 250, width: 70, height: 70, breakable: true, solid: true, hp: 40, maxHp: 40, destroyed: false };
    combat.mapStructures = [structure];
    system.acquire("meteors", { id: 77, x: 185, y: 285, radius: 36, health: 10, maxHealth: 10, large: true, color: "#a94f40" });
    system.impactMeteor(0);
    expect(structure.destroyed).toBe(true);
  });
});
