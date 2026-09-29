/**
 * Global test setup: browser globals the app modules expect at import time.
 */

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  clear() {
    this.data.clear();
  }
}

Object.assign(globalThis, {
  window: globalThis,
  localStorage: new MemoryStorage(),
});

// Keep the test output readable
const { logger } = await import('../utils/logger');
logger.setLevel('ERROR');
