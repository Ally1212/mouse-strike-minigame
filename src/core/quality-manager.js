const TIERS = ["low", "medium", "high"];

export class DynamicQualityManager {
  constructor(initialTier = "high", onChange = () => {}) {
    this.tier = TIERS.includes(initialTier) ? initialTier : "high";
    this.onChange = onChange;
    this.samples = [];
    this.lowDuration = 0;
    this.highDuration = 0;
  }

  sample(delta) {
    if (!Number.isFinite(delta) || delta <= 0) return this.tier;
    const fps = Math.min(120, 1 / delta);
    this.samples.push(fps);
    if (this.samples.length > 60) this.samples.shift();
    const average = this.samples.reduce((sum, value) => sum + value, 0) / this.samples.length;
    if (average < 28) {
      this.lowDuration += delta;
      this.highDuration = 0;
    } else if (average > 55) {
      this.highDuration += delta;
      this.lowDuration = 0;
    } else {
      this.lowDuration = Math.max(0, this.lowDuration - delta);
      this.highDuration = Math.max(0, this.highDuration - delta);
    }
    if (this.lowDuration >= 3) {
      this.lowDuration = 0;
      this.setTier(TIERS[Math.max(0, TIERS.indexOf(this.tier) - 1)], "持续低于 28 FPS");
    } else if (this.highDuration >= 10) {
      this.highDuration = 0;
      this.setTier(TIERS[Math.min(TIERS.length - 1, TIERS.indexOf(this.tier) + 1)], "持续高于 55 FPS");
    }
    return this.tier;
  }

  setTier(next, reason = "手动设置") {
    if (!TIERS.includes(next) || next === this.tier) return false;
    this.tier = next;
    this.onChange(next, reason);
    return true;
  }

  get fps() {
    if (!this.samples.length) return 60;
    return this.samples.reduce((sum, value) => sum + value, 0) / this.samples.length;
  }
}
