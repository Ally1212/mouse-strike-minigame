export class GameClock {
  constructor({ step = 1 / 60, maxDelta = 0.1 } = {}) {
    this.step = step;
    this.maxDelta = maxDelta;
    this.accumulator = 0;
    this.lastTime = null;
    this.paused = true;
    this.elapsed = 0;
  }

  reset(now = 0) {
    this.accumulator = 0;
    this.lastTime = now;
    this.elapsed = 0;
  }

  pause() {
    this.paused = true;
    this.lastTime = null;
  }

  resume(now) {
    this.paused = false;
    this.lastTime = now;
  }

  advance(now, update) {
    if (this.paused) return 0;
    if (this.lastTime === null) this.lastTime = now;
    const delta = Math.min(this.maxDelta, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    this.accumulator += delta;
    let updates = 0;
    while (this.accumulator + Number.EPSILON * 16 >= this.step && updates < 8) {
      update(this.step);
      this.elapsed += this.step;
      this.accumulator -= this.step;
      updates += 1;
    }
    return this.accumulator / this.step;
  }
}
