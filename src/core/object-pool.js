export class ObjectPool {
  constructor(factory, reset, initialSize = 0) {
    this.factory = factory;
    this.reset = reset;
    this.free = [];
    this.active = new Set();
    for (let index = 0; index < initialSize; index += 1) this.free.push(factory());
  }

  acquire(values = {}) {
    const item = this.free.pop() || this.factory();
    this.reset(item, values);
    this.active.add(item);
    return item;
  }

  release(item) {
    if (!this.active.delete(item)) return false;
    item.active = false;
    this.free.push(item);
    return true;
  }

  releaseAll() {
    for (const item of [...this.active]) this.release(item);
  }

  forEach(callback) {
    this.active.forEach(callback);
  }

  get size() {
    return this.active.size;
  }
}
