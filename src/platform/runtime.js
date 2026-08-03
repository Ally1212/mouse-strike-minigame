const globalScope = typeof GameGlobal !== "undefined" ? GameGlobal : globalThis;
const wxApi = typeof wx !== "undefined" ? wx : null;

function browserViewport() {
  return {
    width: Math.max(320, globalThis.innerWidth || 375),
    height: Math.max(568, globalThis.innerHeight || 812),
    pixelRatio: Math.min(globalThis.devicePixelRatio || 1, 2),
    safeArea: { left: 0, top: 0, right: globalThis.innerWidth || 375, bottom: globalThis.innerHeight || 812 },
    menuButton: null,
  };
}

function wxViewport() {
  const info = wxApi.getWindowInfo?.() || wxApi.getSystemInfoSync();
  return {
    width: info.windowWidth,
    height: info.windowHeight,
    pixelRatio: Math.min(info.pixelRatio || 1, 2),
    safeArea: info.safeArea || { left: 0, top: 0, right: info.windowWidth, bottom: info.windowHeight },
    menuButton: wxApi.getMenuButtonBoundingClientRect?.() || null,
    platform: info.platform,
    benchmarkLevel: info.benchmarkLevel,
  };
}

export function createRuntime() {
  const isWx = Boolean(wxApi);
  const viewport = isWx ? wxViewport() : browserViewport();
  let canvas;
  if (isWx) {
    canvas = globalScope.canvas || wxApi.createCanvas();
    globalScope.canvas = canvas;
  } else {
    canvas = document.querySelector("#game") || document.createElement("canvas");
    if (!canvas.parentNode) document.body.append(canvas);
  }
  canvas.width = Math.floor(viewport.width * viewport.pixelRatio);
  canvas.height = Math.floor(viewport.height * viewport.pixelRatio);
  if (canvas.style) {
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    canvas.style.touchAction = "none";
  }

  const listeners = { show: new Set(), hide: new Set(), resize: new Set() };
  const call = (type, payload) => listeners[type].forEach((listener) => listener(payload));
  const refreshViewport = () => {
    const next = isWx ? wxViewport() : browserViewport();
    Object.assign(viewport, next);
    canvas.width = Math.floor(viewport.width * viewport.pixelRatio);
    canvas.height = Math.floor(viewport.height * viewport.pixelRatio);
    if (canvas.style) {
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
    }
    return viewport;
  };
  if (isWx) {
    wxApi.onShow?.((event) => call("show", event));
    wxApi.onHide?.((event) => call("hide", event));
    wxApi.onWindowResize?.((event) => call("resize", { ...event, viewport: refreshViewport() }));
  } else {
    globalThis.addEventListener("focus", (event) => call("show", event));
    globalThis.addEventListener("blur", (event) => call("hide", event));
    globalThis.addEventListener("resize", (event) => call("resize", { event, viewport: refreshViewport() }));
  }

  return {
    isWx,
    api: wxApi,
    canvas,
    viewport,
    now: () => globalThis.performance?.now?.() ?? Date.now(),
    requestFrame: (callback) => canvas.requestAnimationFrame?.(callback) ?? globalThis.requestAnimationFrame(callback),
    cancelFrame: (id) => canvas.cancelAnimationFrame?.(id) ?? globalThis.cancelAnimationFrame?.(id),
    createOffscreenCanvas(width = 256, height = 256) {
      const offscreen = isWx ? wxApi.createCanvas() : document.createElement("canvas");
      offscreen.width = width;
      offscreen.height = height;
      return offscreen;
    },
    createImage() {
      return isWx ? wxApi.createImage() : new Image();
    },
    on(type, listener) {
      listeners[type]?.add(listener);
      return () => listeners[type]?.delete(listener);
    },
    onTouch(type, listener) {
      if (isWx) {
        const method = { start: "onTouchStart", move: "onTouchMove", end: "onTouchEnd", cancel: "onTouchCancel" }[type];
        wxApi[method]?.(listener);
        return () => {};
      }
      const event = { start: "pointerdown", move: "pointermove", end: "pointerup", cancel: "pointercancel" }[type];
      const handler = (input) => listener({
        touches: input.buttons ? [{ identifier: input.pointerId, clientX: input.clientX, clientY: input.clientY }] : [],
        changedTouches: [{ identifier: input.pointerId, clientX: input.clientX, clientY: input.clientY }],
      });
      canvas.addEventListener(event, handler);
      return () => canvas.removeEventListener(event, handler);
    },
    onKey(listener) {
      if (isWx) return () => {};
      globalThis.addEventListener("keydown", listener);
      return () => globalThis.removeEventListener("keydown", listener);
    },
    onContextMenu(listener) {
      if (isWx) return () => {};
      const handler = (event) => {
        event.preventDefault();
        listener(event);
      };
      canvas.addEventListener("contextmenu", handler);
      return () => canvas.removeEventListener("contextmenu", handler);
    },
    requestTextInput({ title = "输入内容", maxLength = 4, numeric = false } = {}) {
      if (!isWx) {
        const value = globalThis.prompt?.(title, "") ?? null;
        return Promise.resolve(value);
      }
      return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          wxApi.offKeyboardConfirm?.(confirm);
          wxApi.offKeyboardComplete?.(complete);
          wxApi.hideKeyboard?.();
          resolve(value);
        };
        const confirm = (event) => finish(event.value || "");
        const complete = (event) => finish(event.value || null);
        wxApi.onKeyboardConfirm?.(confirm);
        wxApi.onKeyboardComplete?.(complete);
        wxApi.showKeyboard({
          defaultValue: "",
          maxLength,
          multiple: false,
          confirmHold: false,
          confirmType: "done",
          success: () => {},
          fail: () => finish(null),
        });
        if (numeric) wxApi.setKeyboardValue?.({ value: "" });
      });
    },
    getStorage(key, fallback = null) {
      try {
        const value = isWx ? wxApi.getStorageSync(key) : globalThis.localStorage?.getItem(key);
        if (value === "" || value === null || value === undefined) return fallback;
        return typeof value === "string" ? JSON.parse(value) : value;
      } catch {
        return fallback;
      }
    },
    setStorage(key, value) {
      try {
        if (isWx) wxApi.setStorageSync(key, value);
        else globalThis.localStorage?.setItem(key, JSON.stringify(value));
      } catch {
        return false;
      }
      return true;
    },
    loadSubpackage(name, onProgress = () => {}) {
      if (!isWx || !wxApi.loadSubpackage) return Promise.resolve({ name, cached: true });
      return new Promise((resolve, reject) => {
        const task = wxApi.loadSubpackage({ name, success: resolve, fail: reject });
        task?.onProgressUpdate?.(onProgress);
      });
    },
    preloadSubpackages(names) {
      if (!isWx || !wxApi.preDownloadSubpackage) return Promise.resolve({ skipped: true });
      return Promise.all(names.map((name) => new Promise((resolve) => wxApi.preDownloadSubpackage({
        packageType: "normal",
        name,
        success: () => resolve({ loaded: name }),
        fail: () => resolve({ skipped: name }),
      }))));
    },
    vibrate(kind = "short") {
      if (!isWx) return;
      if (kind === "long") wxApi.vibrateLong?.();
      else wxApi.vibrateShort?.({ type: kind === "heavy" ? "heavy" : "light" });
    },
    onMemoryWarning(listener) {
      wxApi?.onMemoryWarning?.(listener);
      return () => wxApi?.offMemoryWarning?.(listener);
    },
    onAudioInterruption(begin, end) {
      wxApi?.onAudioInterruptionBegin?.(begin);
      wxApi?.onAudioInterruptionEnd?.(end);
      return () => {
        wxApi?.offAudioInterruptionBegin?.(begin);
        wxApi?.offAudioInterruptionEnd?.(end);
      };
    },
    createWebAudioContext() {
      if (isWx) return wxApi.createWebAudioContext?.() || null;
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      return Context ? new Context() : null;
    },
    createAudioTrack(source) {
      if (isWx) {
        const track = wxApi.createInnerAudioContext?.({ useWebAudioImplement: false });
        if (!track) return null;
        track.src = source;
        return track;
      }
      const track = new Audio(source);
      track.preload = "auto";
      return track;
    },
  };
}
