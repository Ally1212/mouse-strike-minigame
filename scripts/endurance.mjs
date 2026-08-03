import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { FIGHTERS } from "../src/content/fighter-profiles.js";
import { CombatSystem } from "../src/core/combat-system.js";
import { createCombatState } from "../src/core/game-state.js";
import { createRandom } from "../src/core/random.js";

const combat = createCombatState(FIGHTERS.j20);
combat.player.health = 1_000_000_000;
combat.player.maxHealth = 1_000_000_000;
const system = new CombatSystem({
  combat,
  fighterId: "j20",
  mapId: "usa",
  width: 375,
  height: 812,
  random: createRandom(7),
  emit: () => {},
});
const maximums = Object.fromEntries(Object.keys(combat.entities).map((key) => [key, 0]));
globalThis.gc?.();
const heapBefore = process.memoryUsage().heapUsed;
let updates = 0;
while (combat.elapsed < 20 * 60 && updates < 40_000) {
  if (combat.pendingMissionId) system.skipMission();
  if (combat.airdrop?.choiceOpen) system.chooseAirdrop("firepower");
  if (combat.transformCores >= 3 && !combat.transformed) system.tryTransform();
  if (combat.elapsed >= 15 && combat.wingmanCooldown <= 0) system.summonWingman();
  system.update(0.05);
  for (const [key, values] of Object.entries(combat.entities)) maximums[key] = Math.max(maximums[key], values.length);
  updates += 1;
}
if (combat.elapsed < 20 * 60 || combat.ended) throw new Error("Endurance simulation did not complete 20 gameplay minutes");
if (maximums.particles > 120 || maximums.enemies > 80 || maximums.enemyProjectiles > 400 || maximums.playerProjectiles > 220) {
  throw new Error(`Entity budget exceeded: ${JSON.stringify(maximums)}`);
}
for (const key of Object.keys(system.pools)) system.clearEntityKind(key);
globalThis.gc?.();
const heapAfter = process.memoryUsage().heapUsed;
const activePools = Object.fromEntries(Object.entries(system.pools).map(([key, pool]) => [key, pool.active.size]));
if (Object.values(activePools).some((size) => size !== 0)) throw new Error(`Object pools retained active entities: ${JSON.stringify(activePools)}`);
const report = {
  generatedAt: new Date().toISOString(),
  simulatedGameplaySeconds: combat.elapsed,
  updates,
  wave: combat.wave,
  kills: combat.kills,
  maximums,
  activePoolsAfterCleanup: activePools,
  heapBefore,
  heapAfter,
};
const reports = resolve(import.meta.dirname, "../reports");
await mkdir(reports, { recursive: true });
await writeFile(resolve(reports, "local-endurance-report.json"), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`local endurance passed: gameplay=${combat.elapsed.toFixed(1)}s updates=${updates} wave=${combat.wave}\n`);
