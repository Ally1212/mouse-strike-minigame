const FIGHTER_PACKAGES = {
  j20: null,
  j35: "fighters-cn-us",
  faxx: "fighters-cn-us",
  f22: "fighters-cn-us",
  typhoon: "fighters-eu-ru",
  rafale: "fighters-eu-ru",
  gripen: "fighters-eu-ru",
  su57: "fighters-eu-ru",
  hypersonic: "fighter-x10",
};

const MAP_PACKAGES = {
  usa: null,
  pacific: "maps-extra",
  arctic: "maps-extra",
  "sky-corridor": "maps-extra",
  "meteor-rift": "maps-extra",
};

export class ResourceManager {
  constructor(runtime) {
    this.runtime = runtime;
    this.loaded = new Set();
    this.loading = new Map();
  }

  packageForFighter(fighterId) {
    return FIGHTER_PACKAGES[fighterId] ?? null;
  }

  packageForMap(mapId) {
    return MAP_PACKAGES[mapId] ?? null;
  }

  statusForMap(mapId) {
    const name = this.packageForMap(mapId);
    if (!name || this.loaded.has(name)) return "ready";
    return this.loading.has(name) ? "loading" : "remote";
  }

  async ensure({ fighterId, mapId }, onProgress = () => {}) {
    const names = [...new Set([this.packageForFighter(fighterId), this.packageForMap(mapId)].filter(Boolean))];
    for (const name of names) await this.load(name, onProgress);
    return names;
  }

  async load(name, onProgress = () => {}) {
    if (!name || this.loaded.has(name)) return;
    if (this.loading.has(name)) return this.loading.get(name);
    const promise = this.runtime.loadSubpackage(name, onProgress)
      .then((result) => {
        this.loaded.add(name);
        this.loading.delete(name);
        return result;
      })
      .catch((error) => {
        this.loading.delete(name);
        throw error;
      });
    this.loading.set(name, promise);
    return promise;
  }

  preloadLikely() {
    return this.runtime.preloadSubpackages(["fighters-cn-us", "maps-extra", "audio-extra"]);
  }
}
