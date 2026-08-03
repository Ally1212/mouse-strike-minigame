import { createInitialState, STORAGE_KEY } from "../core/game-state.js";
import { createRuntime } from "../platform/runtime.js";
import { ResourceManager } from "../platform/resource-manager.js";
import { GameApp } from "./game-app.js";

export async function bootstrap() {
  const runtime = createRuntime();
  const state = createInitialState(runtime.getStorage(STORAGE_KEY, {}));
  const resources = new ResourceManager(runtime);
  resources.preloadLikely();
  const app = new GameApp({ runtime, state, resources });
  app.start();
  const api = { runtime, state, resources, app };
  const globalScope = typeof GameGlobal !== "undefined" ? GameGlobal : globalThis;
  if (__QA_ENABLED__) {
    const { createQaController } = await import("../qa/qa-controller.js");
    api.qa = createQaController(app);
    globalScope.__mouseStrikeQA = api.qa;
  }
  globalScope.__mouseStrikeMiniGame = api;
  console.info("Mouse Strike runtime ready");
  return api;
}
