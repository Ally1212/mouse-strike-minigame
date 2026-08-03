const SOUND_SPECS = {
  fire: [620, 0.025, "square", 0.025],
  hit: [180, 0.045, "square", 0.04],
  kill: [110, 0.08, "sawtooth", 0.06],
  graze: [980, 0.04, "sine", 0.045],
  switchForm: [520, 0.09, "square", 0.06],
  reject: [150, 0.1, "square", 0.055],
  skill: [310, 0.22, "sawtooth", 0.09],
  transformReady: [880, 0.18, "square", 0.08],
  transform: [140, 0.55, "sawtooth", 0.12],
  transformEnd: [260, 0.16, "triangle", 0.06],
  wingman: [440, 0.28, "square", 0.08],
  laserCharge: [260, 0.22, "sine", 0.07],
  laserBeam: [90, 0.28, "sawtooth", 0.08],
  laserOverheat: [120, 0.2, "square", 0.08],
  enemyFire: [230, 0.04, "triangle", 0.028],
  wave: [660, 0.16, "square", 0.06],
  collision: [75, 0.08, "square", 0.06],
  playerHit: [65, 0.22, "sawtooth", 0.12],
  shieldBreak: [760, 0.2, "triangle", 0.08],
  barrierBlock: [1050, 0.04, "sine", 0.035],
  pickup: [720, 0.11, "square", 0.065],
  mapEvent: [390, 0.22, "triangle", 0.07],
  meteorWarning: [210, 0.28, "square", 0.08],
  meteorBreak: [95, 0.2, "sawtooth", 0.1],
  meteorImpact: [55, 0.38, "sawtooth", 0.13],
  airdropIncoming: [460, 0.24, "square", 0.06],
  airdropLanded: [160, 0.2, "triangle", 0.08],
  airdropEscort: [520, 0.18, "square", 0.06],
  airdropUpgrade: [920, 0.32, "square", 0.09],
  airdropClaim: [680, 0.24, "triangle", 0.08],
  airdropFail: [130, 0.28, "square", 0.08],
  missionAlert: [570, 0.28, "square", 0.08],
  missionStart: [760, 0.25, "triangle", 0.08],
  missionResult: [840, 0.3, "square", 0.08],
  ring: [1040, 0.08, "sine", 0.06],
  chain: [120, 0.24, "sawtooth", 0.09],
  structureBreak: [85, 0.22, "square", 0.08],
  bossEnter: [72, 0.65, "sawtooth", 0.13],
  bossFire: [155, 0.09, "square", 0.05],
  bossPhase: [240, 0.45, "sawtooth", 0.12],
  bossPart: [92, 0.35, "square", 0.12],
  bossDefeat: [58, 0.8, "sawtooth", 0.15],
  nuclearLaunch: [180, 0.6, "sine", 0.12],
  nuclearBlast: [42, 1, "sawtooth", 0.18],
  gameOver: [120, 0.75, "square", 0.1],
  uiMove: [560, 0.055, "triangle", 0.035],
  uiConfirm: [760, 0.075, "sine", 0.04],
};

// Original chiptune phrases: arcade-inspired without reusing sampled game audio.
const RETRO_PATTERNS = {
  uiMove: [[0, 1], [0.035, 1.34]],
  uiConfirm: [[0, 1], [0.045, 1.25], [0.09, 1.68]],
  pickup: [[0, 1], [0.055, 1.26], [0.11, 1.59]],
  switchForm: [[0, 1], [0.05, 0.75]],
  skill: [[0, 1], [0.065, 1.5], [0.13, 0.75]],
  transformReady: [[0, 1], [0.06, 1.25], [0.12, 1.5]],
  transform: [[0, 1], [0.1, 1.5], [0.2, 2], [0.3, 2.5]],
  wave: [[0, 1], [0.07, 1.26], [0.14, 1.5]],
  bossEnter: [[0, 1], [0.16, 0.75], [0.32, 0.5]],
  missionResult: [[0, 1], [0.08, 1.25], [0.16, 1.5]],
};

export class AudioManager {
  constructor(runtime, settings) {
    this.runtime = runtime;
    this.settings = settings;
    this.context = runtime.createWebAudioContext();
    this.master = null;
    this.track = null;
    this.started = false;
    this.suspendedBySystem = false;
    this.lastPlayed = new Map();
    this.minimumIntervals = { fire: 0.055, hit: 0.025, enemyFire: 0.08, barrierBlock: 0.06 };
    if (this.context) {
      this.master = this.context.createGain();
      this.master.gain.value = this.currentGain();
      this.master.connect(this.context.destination);
    }
    this.musicPath = runtime.isWx
      ? "subpackages/audio-extra/assets/on-the-offensive.ogg"
      : "/audio/on-the-offensive.ogg";
    if (!runtime.isWx) this.prepareMusic();
  }

  prepareMusic() {
    if (this.track) return this.track;
    this.track = this.runtime.createAudioTrack(this.musicPath);
    if (this.track) {
      this.track.loop = true;
      this.track.volume = this.currentGain() * 0.38;
      if (this.started && !this.settings.muted && !this.suspendedBySystem) {
        const result = this.track.play?.();
        result?.catch?.(() => {});
      }
    }
    return this.track;
  }

  currentGain() {
    return this.settings.muted ? 0 : Math.max(0, Math.min(1, this.settings.volume));
  }

  async unlock() {
    if (this.context?.state === "suspended") await this.context.resume?.().catch(() => {});
    if (!this.settings.muted && !this.started) {
      this.started = true;
      const result = this.track?.play?.();
      result?.catch?.(() => {});
    }
  }

  setSettings(settings) {
    this.settings = settings;
    const gain = this.currentGain();
    if (this.master) this.master.gain.value = gain;
    if (this.track) {
      this.track.volume = gain * 0.38;
      if (settings.muted) this.track.pause?.();
      else if (!this.suspendedBySystem) {
        this.started = true;
        const result = this.track.play?.();
        result?.catch?.(() => {});
      }
    }
  }

  play(name, payload = {}) {
    if (this.settings.muted || !this.context || !this.master) return false;
    const now = this.context.currentTime || 0;
    const last = this.lastPlayed.get(name) ?? -Infinity;
    if (now - last < (this.minimumIntervals[name] || 0)) return false;
    this.lastPlayed.set(name, now);
    const [frequency, duration, wave, volume] = SOUND_SPECS[name] || SOUND_SPECS.hit;
    const pitch = payload.pattern === "rail" ? 1.35 : payload.pattern === "heavy" ? 0.72 : payload.large ? 0.62 : 1;
    const phrase = RETRO_PATTERNS[name] || [[0, 1]];
    phrase.forEach(([delay, ratio], index) => {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      const start = now + delay;
      const noteDuration = phrase.length > 1 ? Math.min(duration, 0.09) : duration;
      oscillator.type = phrase.length > 1 ? "square" : wave;
      oscillator.frequency.setValueAtTime(frequency * pitch * ratio, start);
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(35, frequency * pitch * ratio * (name.includes("Blast") || name.includes("Impact") ? 0.35 : 1.12)),
        start + noteDuration,
      );
      gain.gain.setValueAtTime(Math.max(0.0001, volume / Math.max(1, phrase.length * 0.72)), start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + noteDuration);
      oscillator.connect(gain);
      gain.connect(this.master);
      oscillator.onended = () => {
        oscillator.disconnect?.();
        gain.disconnect?.();
      };
      oscillator.start(start);
      oscillator.stop(start + noteDuration + 0.02 + index * 0.001);
    });
    return true;
  }

  pause() {
    this.track?.pause?.();
    this.context?.suspend?.();
  }

  resume() {
    if (this.suspendedBySystem || this.settings.muted) return;
    this.context?.resume?.();
    if (this.started) {
      const result = this.track?.play?.();
      result?.catch?.(() => {});
    }
  }

  interruptionBegin() {
    this.suspendedBySystem = true;
    this.pause();
  }

  interruptionEnd() {
    this.suspendedBySystem = false;
  }

  dispose() {
    this.track?.stop?.();
    this.track?.destroy?.();
    this.master?.disconnect?.();
    this.context?.close?.();
    this.track = null;
    this.context = null;
  }
}
