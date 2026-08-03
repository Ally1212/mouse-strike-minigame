import { build, context } from "esbuild";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist");
const watch = process.argv.includes("--watch");

async function copyFile(source, target) {
  await mkdir(dirname(target), { recursive: true });
  await cp(source, target);
}

async function prepareDist() {
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  await copyFile(join(root, "game.json"), join(dist, "game.json"));
  await copyFile(join(root, "THIRD_PARTY_NOTICES.md"), join(dist, "THIRD_PARTY_NOTICES.md"));
  await copyFile(join(root, "assets/audio/on-the-offensive.ogg"), join(dist, "subpackages/audio-extra/assets/on-the-offensive.ogg"));

  const packageEntries = {
    "fighters-cn-us": ["j35", "faxx", "f22"],
    "fighters-eu-ru": ["typhoon", "rafale", "gripen", "su57"],
    "fighter-x10": ["hypersonic"],
    "maps-extra": ["pacific", "arctic", "sky-corridor", "meteor-rift"],
    "audio-extra": ["on-the-offensive"],
  };
  for (const [name, content] of Object.entries(packageEntries)) {
    const code = `GameGlobal.__mouseStrikePackages ||= {};\nGameGlobal.__mouseStrikePackages[${JSON.stringify(name)}] = ${JSON.stringify(content)};\n`;
    const packageRoot = join(dist, `subpackages/${name}`);
    await mkdir(packageRoot, { recursive: true });
    await writeFile(join(packageRoot, "game.js"), code);
    await writeFile(join(packageRoot, "index.js"), code);
  }
}

async function reportSizes() {
  async function directorySize(path) {
    const { readdir } = await import("node:fs/promises");
    let total = 0;
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const current = join(path, entry.name);
      total += entry.isDirectory() ? await directorySize(current) : (await stat(current)).size;
    }
    return total;
  }

  const totalBytes = await directorySize(dist);
  let subpackageBytes = 0;
  try {
    subpackageBytes = await directorySize(join(dist, "subpackages"));
  } catch {
    subpackageBytes = 0;
  }
  const mainBytes = totalBytes - subpackageBytes;
  const report = {
    generatedAt: new Date().toISOString(),
    mainBytes,
    subpackageBytes,
    totalBytes,
    limits: { mainBytes: 4 * 1024 * 1024, totalBytes: 30 * 1024 * 1024 },
  };
  await writeFile(join(dist, "bundle-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  if (mainBytes > report.limits.mainBytes) throw new Error(`Main package exceeds 4 MB: ${mainBytes}`);
  if (totalBytes > report.limits.totalBytes) throw new Error(`Total package exceeds 30 MB: ${totalBytes}`);
  process.stdout.write(`main ${(mainBytes / 1024 / 1024).toFixed(2)} MB, total ${(totalBytes / 1024 / 1024).toFixed(2)} MB\n`);
}

const options = {
  entryPoints: [join(root, "src/main.js")],
  outfile: join(dist, "game.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2018"],
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  define: {
    "process.env.NODE_ENV": JSON.stringify(watch ? "development" : "production"),
    __QA_ENABLED__: JSON.stringify(watch),
  },
  banner: { js: "var GameGlobal = typeof GameGlobal !== 'undefined' ? GameGlobal : globalThis;" },
  logLevel: "info",
};

await prepareDist();
if (watch) {
  const buildContext = await context(options);
  await buildContext.watch();
  process.stdout.write("watching mini game source\n");
} else {
  await build(options);
  await reportSizes();
}
