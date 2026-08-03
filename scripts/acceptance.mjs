import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const report = JSON.parse(await readFile(resolve(root, "dist/bundle-report.json"), "utf8"));
const projectConfig = JSON.parse(await readFile(resolve(root, "project.config.json"), "utf8"));
if (projectConfig.compileType !== "game") throw new Error("Project compileType must be game");
if (projectConfig.miniprogramRoot !== "dist/") throw new Error("Project source root must point to dist/");
const required = [
  "REQUIREMENTS.md",
  "ACCEPTANCE.md",
  "ACCEPTANCE_STATUS.md",
  "THIRD_PARTY_NOTICES.md",
  "reports/local-startup-report.json",
  "reports/local-endurance-report.json",
  "dist/game.js",
  "dist/game.json",
  "dist/subpackages/fighters-cn-us/game.js",
  "dist/subpackages/fighters-cn-us/index.js",
  "dist/subpackages/fighters-eu-ru/game.js",
  "dist/subpackages/fighters-eu-ru/index.js",
  "dist/subpackages/fighter-x10/game.js",
  "dist/subpackages/fighter-x10/index.js",
  "dist/subpackages/maps-extra/game.js",
  "dist/subpackages/maps-extra/index.js",
  "dist/subpackages/audio-extra/game.js",
  "dist/subpackages/audio-extra/index.js",
  "dist/subpackages/audio-extra/assets/on-the-offensive.ogg",
];
for (const file of required) {
  const info = await stat(resolve(root, file));
  if (!info.isFile() || info.size === 0) throw new Error(`Missing build artifact: ${file}`);
}
if (report.mainBytes > report.limits.mainBytes) throw new Error("Main package exceeds 4 MB");
if (report.totalBytes > report.limits.totalBytes) throw new Error("Total package exceeds 30 MB");

const gameConfig = JSON.parse(await readFile(resolve(root, "dist/game.json"), "utf8"));
if (gameConfig.deviceOrientation !== "portrait") throw new Error("Mini game must default to portrait orientation");
const declaredPackages = (gameConfig.subpackages || []).map((item) => item.name);
const expectedPackages = ["fighters-cn-us", "fighters-eu-ru", "fighter-x10", "maps-extra", "audio-extra"];
if (JSON.stringify(declaredPackages) !== JSON.stringify(expectedPackages)) throw new Error("Subpackage declaration mismatch");

const productionBundle = await readFile(resolve(root, "dist/game.js"), "utf8");
for (const symbol of ["__mouseStrikeQA", "QA action requires", "Unknown fighter:"]) {
  if (productionBundle.includes(symbol)) throw new Error(`Production bundle contains QA symbol: ${symbol}`);
}

const requirements = await readFile(resolve(root, "REQUIREMENTS.md"), "utf8");
const acceptance = await readFile(resolve(root, "ACCEPTANCE.md"), "utf8");
const acceptanceStatus = await readFile(resolve(root, "ACCEPTANCE_STATUS.md"), "utf8");
if (/\b(?:TODO|TBD)\b/.test(`${requirements}\n${acceptance}\n${acceptanceStatus}`)) throw new Error("Requirements documents contain unresolved TODO/TBD markers");
const acceptanceIds = [...acceptance.matchAll(/^### ([A-Z0-9-]+) /gm)].map((match) => match[1]);
if (new Set(acceptanceIds).size !== acceptanceIds.length) throw new Error("Acceptance case IDs must be unique");
const statusIds = [...acceptanceStatus.matchAll(/^\| `([A-Z0-9-]+)` \|/gm)].map((match) => match[1]);
if (JSON.stringify(statusIds) !== JSON.stringify(acceptanceIds)) throw new Error("Acceptance status matrix must cover every case in document order");
const localPassed = [...acceptanceStatus.matchAll(/^\| `[A-Z0-9-]+` \|.*\| 本地通过 \|/gm)].length;
const pendingExternal = [...acceptanceStatus.matchAll(/^\| `[A-Z0-9-]+` \|.*\| 待外部验收 \|/gm)].length;
if (localPassed + pendingExternal !== acceptanceIds.length) throw new Error("Every acceptance status row must have a recognized conclusion");

const startupReport = JSON.parse(await readFile(resolve(root, "reports/local-startup-report.json"), "utf8"));
if (startupReport.samplesMs?.length !== 10 || startupReport.medianMs > 6000 || startupReport.p90Ms > 10000) {
  throw new Error("Local startup report does not meet the documented threshold");
}
const enduranceReport = JSON.parse(await readFile(resolve(root, "reports/local-endurance-report.json"), "utf8"));
if (enduranceReport.simulatedGameplaySeconds < 1200) throw new Error("Local endurance report is shorter than 20 gameplay minutes");
if (Object.values(enduranceReport.activePoolsAfterCleanup || {}).some((size) => size !== 0)) {
  throw new Error("Local endurance report retained active pooled objects after cleanup");
}

const notices = await readFile(resolve(root, "THIRD_PARTY_NOTICES.md"), "utf8");
for (const requiredNotice of ["Three.js", "CC0", "ZzFX", "Lucide", "excluded from build"]) {
  if (!notices.includes(requiredNotice)) throw new Error(`Missing third-party notice: ${requiredNotice}`);
}

const acceptanceReport = {
  generatedAt: new Date().toISOString(),
  checks: {
    requiredFiles: required.length,
    acceptanceCases: acceptanceIds.length,
    localPassed,
    pendingExternal,
    localStartup: { medianMs: startupReport.medianMs, p90Ms: startupReport.p90Ms, samples: startupReport.samplesMs.length },
    localEndurance: { gameplaySeconds: enduranceReport.simulatedGameplaySeconds, wave: enduranceReport.wave, activePoolsAfterCleanup: enduranceReport.activePoolsAfterCleanup },
    subpackages: declaredPackages,
    productionQaDisabled: true,
    unresolvedMarkers: 0,
    notices: ["Three.js", "CC0", "ZzFX", "Lucide", "fighter references excluded"],
  },
  bundle: report,
};
await writeFile(resolve(root, "dist/acceptance-report.json"), `${JSON.stringify(acceptanceReport, null, 2)}\n`);
process.stdout.write(`acceptance foundation passed: cases=${acceptanceIds.length}, main=${report.mainBytes}, total=${report.totalBytes}\n`);
