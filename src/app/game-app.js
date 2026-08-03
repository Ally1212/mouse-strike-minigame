import { AudioManager } from "../audio/audio-manager.js";
import { BATTLE_MAPS, MAP_ORDER } from "../content/battle-maps.js";
import { FIGHTER_ORDER, FIGHTERS } from "../content/fighter-profiles.js";
import { CombatSystem } from "../core/combat-system.js";
import { GameClock } from "../core/clock.js";
import { createCombatState, serializeSettings, STORAGE_KEY } from "../core/game-state.js";
import { DynamicQualityManager } from "../core/quality-manager.js";
import { GameRenderer } from "../render/renderer.js";
import { computeCombatLayout, computeHangarLayout, contains } from "../ui/layout.js";

export class GameApp {
  constructor({ runtime, state, resources }) {
    this.runtime = runtime;
    this.state = state;
    this.resources = resources;
    this.renderer = new GameRenderer(runtime, state);
    this.audio = new AudioManager(runtime, state.settings);
    this.clock = new GameClock({ step: 1 / 60, maxDelta: 0.1 });
    this.quality = new DynamicQualityManager(state.settings.quality, (tier, reason) => this.onQualityChanged(tier, reason));
    this.combatSystem = null;
    this.frame = null;
    this.lastTime = runtime.now();
    this.hangarTouch = null;
    this.combatTouches = new Map();
    this.launchSequence = 0;
    this.unsubscribers = [];
  }

  start() {
    this.bindEvents();
    this.state.scene = "hangar";
    this.renderer.setQuality(this.state.settings.quality);
    this.loop(this.runtime.now());
  }

  bindEvents() {
    this.unsubscribers.push(
      this.runtime.onTouch("start", (event) => this.onTouchStart(event)),
      this.runtime.onTouch("move", (event) => this.onTouchMove(event)),
      this.runtime.onTouch("end", (event) => this.onTouchEnd(event)),
      this.runtime.onTouch("cancel", (event) => this.onTouchCancel(event)),
      this.runtime.on("hide", () => this.pause("background")),
      this.runtime.on("show", () => this.resumeFromBackground()),
      this.runtime.on("resize", () => this.onResize()),
      this.runtime.onKey((event) => this.onKey(event)),
      this.runtime.onContextMenu(() => this.combatSystem?.tryTransform()),
      this.runtime.onMemoryWarning(() => this.onMemoryWarning()),
      this.runtime.onAudioInterruption(() => {
        this.audio.interruptionBegin();
        this.pause("audio-interruption");
      }, () => {
        this.audio.interruptionEnd();
        this.resumeFromBackground();
      }),
    );
  }

  loop(now) {
    const rawDelta = Math.min(0.1, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    if (this.state.toast) {
      this.state.toast.time -= rawDelta;
      if (this.state.toast.time <= 0) this.state.toast = null;
    }
    if (this.state.scene === "combat" && this.combatSystem && !this.state.paused) {
      this.clock.advance(now, (step) => this.combatSystem.update(step));
      this.quality.sample(rawDelta);
      this.state.combat.quality.fps = this.quality.fps;
      this.state.combat.quality.tier = this.quality.tier;
    }
    if (this.state.scene === "hangar" || this.state.scene === "loading") this.updateHangarAnimations(rawDelta);
    this.renderer.render(this.state, rawDelta);
    this.frame = this.runtime.requestFrame((time) => this.loop(time));
  }

  updateHangarAnimations(delta) {
    const hangar = this.state.hangar;
    const damping = this.state.settings.reducedMotion ? 32 : 13;
    if (this.hangarTouch?.role !== "cards") {
      hangar.dragOffset *= Math.exp(-delta * damping);
      hangar.dragVelocity *= Math.exp(-delta * 18);
      if (Math.abs(hangar.dragOffset) < 0.2) hangar.dragOffset = 0;
      if (Math.abs(hangar.dragVelocity) < 0.01) hangar.dragVelocity = 0;
    }
    hangar.transition *= Math.exp(-delta * (this.state.settings.reducedMotion ? 30 : 8));
    if (Math.abs(hangar.transition) < 0.01) hangar.transition = 0;
  }

  pointsFromEvent(event, changed = false) {
    const list = changed ? event.changedTouches : event.touches;
    return [...(list || [])].map((point) => ({ id: point.identifier, x: point.clientX, y: point.clientY }));
  }

  onTouchStart(event) {
    this.audio.unlock();
    const points = this.pointsFromEvent(event, true);
    if (!points.length) points.push(...this.pointsFromEvent(event));
    if (this.state.scene === "hangar") {
      const point = points[0];
      if (point) {
        const layout = computeHangarLayout(
          this.runtime.viewport.width,
          this.runtime.viewport.height,
          this.runtime.viewport.safeArea,
          this.runtime.viewport.menuButton,
        );
        const preview = layout.previewButtons.find((rect) => contains(rect, point.x, point.y));
        const card = layout.fighterCards.find((rect) => contains(rect, point.x, point.y));
        const progress = contains(layout.fighterProgress, point.x, point.y);
        const role = this.state.modal ? "modal"
          : preview ? `preview:${preview.id}`
            : contains(layout.rules, point.x, point.y) ? "rules"
              : contains(layout.sound, point.x, point.y) ? "sound"
                : contains(layout.map, point.x, point.y) ? "map"
                  : contains(layout.start, point.x, point.y) ? "start"
                    : contains(layout.fighterPrev, point.x, point.y) ? "fighter-prev"
                      : contains(layout.fighterNext, point.x, point.y) ? "fighter-next"
                        : progress ? "fighter-progress"
                          : card ? "cards"
                      : contains(layout.cards, point.x, point.y) ? "cards"
                        : contains(layout.preview, point.x, point.y) ? "model"
                          : "idle";
        this.hangarTouch = {
          ...point,
          startX: point.x,
          startY: point.y,
          lastX: point.x,
          moved: false,
          role,
          cardOffset: card?.offset ?? null,
          startTime: this.runtime.now(),
          lastTime: this.runtime.now(),
          velocityX: 0,
        };
        this.state.uiPress = card ? `fighter:${card.offset}` : role;
      }
      return;
    }
    if (this.state.scene !== "combat") return;
    const layout = computeCombatLayout(
      this.runtime.viewport.width,
      this.runtime.viewport.height,
      this.runtime.viewport.safeArea,
      this.runtime.viewport.menuButton,
    );
    for (const point of points) {
      if (this.state.modal) {
        this.combatTouches.set(point.id, { ...point, role: "modal" });
        this.state.uiPress = "modal";
        continue;
      }
      if (contains(layout.pause, point.x, point.y)) {
        this.combatTouches.set(point.id, { ...point, role: "pause" });
        this.state.uiPress = "pause";
        this.pause("manual");
        continue;
      }
      const action = Object.values(layout.actions).find((rect) => contains(rect, point.x, point.y));
      if (action) {
        this.combatTouches.set(point.id, { ...point, role: `action:${action.id}` });
        this.state.uiPress = action.id;
        this.activateAction(action.id);
        continue;
      }
      if (contains(layout.moveArea, point.x, point.y)) {
        this.combatTouches.set(point.id, { ...point, role: "move" });
        this.combatSystem?.movePlayer(point.x, point.y);
      }
    }
  }

  onTouchMove(event) {
    if (this.state.scene === "hangar") {
      if (!this.hangarTouch) return;
      const point = this.pointsFromEvent(event).find((item) => item.id === this.hangarTouch.id);
      if (!point) return;
      this.hangarTouch.x = point.x;
      this.hangarTouch.y = point.y;
      if (Math.hypot(point.x - this.hangarTouch.startX, point.y - this.hangarTouch.startY) > 12) {
        this.hangarTouch.moved = true;
        this.state.uiPress = null;
      }
      if (this.hangarTouch.role === "model") {
        this.state.hangar.modelRotation += (point.x - this.hangarTouch.lastX) * 0.012;
        this.hangarTouch.lastX = point.x;
      } else if (this.hangarTouch.role === "cards") {
        const now = this.runtime.now();
        const elapsed = Math.max(1, now - this.hangarTouch.lastTime);
        const instantVelocity = (point.x - this.hangarTouch.lastX) / elapsed;
        this.hangarTouch.velocityX = this.hangarTouch.velocityX * 0.55 + instantVelocity * 0.45;
        this.hangarTouch.lastX = point.x;
        this.hangarTouch.lastTime = now;
        this.state.hangar.dragVelocity = this.hangarTouch.velocityX;
        this.state.hangar.dragOffset = Math.max(-92, Math.min(92, point.x - this.hangarTouch.startX));
      }
      return;
    }
    if (this.state.scene !== "combat" || this.state.modal) return;
    for (const point of this.pointsFromEvent(event)) {
      const touch = this.combatTouches.get(point.id);
      if (touch?.role !== "move") continue;
      touch.x = point.x;
      touch.y = point.y;
      this.combatSystem?.movePlayer(point.x, point.y);
    }
  }

  onTouchEnd(event) {
    const points = this.pointsFromEvent(event, true);
    if (this.state.scene === "hangar") {
      if (!this.hangarTouch) return;
      const point = points.find((item) => item.id === this.hangarTouch.id) || this.hangarTouch;
      const touch = { ...this.hangarTouch, x: point.x, y: point.y };
      this.hangarTouch = null;
      this.handleHangarTouch(touch);
      this.state.hangar.dragOffset = 0;
      this.state.uiPress = null;
      return;
    }
    for (const point of points) {
      const touch = this.combatTouches.get(point.id);
      this.combatTouches.delete(point.id);
      if (touch?.role === "modal" && this.state.modal) this.handleModalTouch(point);
    }
    if (!this.combatTouches.size) this.state.uiPress = null;
  }

  onTouchCancel(event) {
    const points = this.pointsFromEvent(event, true);
    if (!points.length) this.combatTouches.clear();
    else points.forEach((point) => this.combatTouches.delete(point.id));
    this.hangarTouch = null;
    if (this.state.hangar) this.state.hangar.dragOffset = 0;
    this.state.uiPress = null;
  }

  handleModalTouch(point) {
    const option = this.state.modal?.optionRects?.find((rect) => contains(rect, point.x, point.y));
    if (option) this.handleModalOption(option.id);
  }

  handleHangarTouch(touch) {
    const layout = computeHangarLayout(
      this.runtime.viewport.width,
      this.runtime.viewport.height,
      this.runtime.viewport.safeArea,
      this.runtime.viewport.menuButton,
    );
    if (this.state.modal) {
      this.handleModalTouch(touch);
      return;
    }
    if (touch.role.startsWith("preview:") && !touch.moved) {
      const previewId = touch.role.slice(8);
      this.state.hangar.previewMode = previewId;
      if (this.state.hangar.guideStage === 1) this.advanceHangarGuide(2);
      this.audio.play("uiConfirm");
      if (this.state.settings.haptics) this.runtime.vibrate("short");
      return;
    }
    if (touch.role === "rules" && !touch.moved) {
      this.openRules();
      return;
    }
    if (touch.role === "sound" && !touch.moved) {
      this.openSettings();
      return;
    }
    if (touch.role === "map" && !touch.moved) {
      if (this.state.hangar.guideStage === 2) this.advanceHangarGuide(3);
      this.openMapPicker();
      return;
    }
    if (touch.role === "start" && !touch.moved) {
      if (this.state.hangar.guideStage < 3) this.advanceHangarGuide(3);
      this.launchSelectedFighter();
      return;
    }
    const selectedIndex = FIGHTER_ORDER.indexOf(this.state.fighterId);
    if (touch.role === "fighter-prev" && !touch.moved) {
      const nextIndex = (selectedIndex - 1 + FIGHTER_ORDER.length) % FIGHTER_ORDER.length;
      this.selectFighter(FIGHTER_ORDER[nextIndex], -1);
      return;
    }
    if (touch.role === "fighter-next" && !touch.moved) {
      const nextIndex = (selectedIndex + 1) % FIGHTER_ORDER.length;
      this.selectFighter(FIGHTER_ORDER[nextIndex], 1);
      return;
    }
    if (touch.role === "fighter-progress" && !touch.moved) {
      const ratio = Math.max(0, Math.min(0.999, (touch.x - layout.fighterProgress.x) / layout.fighterProgress.width));
      const nextIndex = Math.min(FIGHTER_ORDER.length - 1, Math.floor(ratio * FIGHTER_ORDER.length));
      const direction = nextIndex === selectedIndex ? 0 : nextIndex > selectedIndex ? 1 : -1;
      this.selectFighter(FIGHTER_ORDER[nextIndex], direction);
      return;
    }
    if (touch.role === "cards" && touch.moved && (Math.abs(touch.x - touch.startX) > 36 || Math.abs(touch.velocityX) > 0.42)) {
      const direction = (Math.abs(touch.velocityX) > 0.42 ? touch.velocityX < 0 : touch.x < touch.startX) ? 1 : -1;
      const next = (selectedIndex + direction + FIGHTER_ORDER.length) % FIGHTER_ORDER.length;
      this.selectFighter(FIGHTER_ORDER[next], direction);
      return;
    }
    if (touch.role === "cards" && !touch.moved && touch.cardOffset !== null) {
      const nextIndex = (selectedIndex + touch.cardOffset + FIGHTER_ORDER.length) % FIGHTER_ORDER.length;
      this.selectFighter(FIGHTER_ORDER[nextIndex], touch.cardOffset);
      return;
    }
    if (touch.role === "model") return;
  }

  onKey(event) {
    if (this.state.scene !== "combat") return;
    if (event.key.toLowerCase() === "q") this.pause("manual");
    else if (event.code === "Space") {
      event.preventDefault();
      this.combatSystem?.summonWingman();
    } else if (event.key.toLowerCase() === "e") this.combatSystem?.useSkill();
    else if (event.key.toLowerCase() === "f") this.combatSystem?.cycleTool();
    else if (event.key.toLowerCase() === "r") this.combatSystem?.tryTransform();
  }

  activateAction(id) {
    if (!this.combatSystem || this.state.paused) return;
    if (id === "form") this.combatSystem.cycleTool();
    else if (id === "skill") this.combatSystem.useSkill();
    else if (id === "transform") this.combatSystem.tryTransform();
    else if (id === "wingman") this.combatSystem.summonWingman();
  }

  selectFighter(fighterId, direction = 0) {
    if (fighterId === this.state.fighterId) return;
    this.state.fighterId = fighterId;
    this.state.hangar.previewMode = "flight";
    this.state.hangar.modelRotation = 0;
    this.state.hangar.transition = this.state.settings.reducedMotion ? 0 : Math.sign(direction || 1);
    this.state.hangar.dragOffset = this.state.settings.reducedMotion ? 0 : -Math.sign(direction || 1) * 28;
    this.renderer.setFighter(fighterId);
    this.audio.play("uiMove");
    if (this.state.settings.haptics) this.runtime.vibrate("short");
    if (this.state.hangar.guideStage === 0) this.advanceHangarGuide(1);
    this.persist();
  }

  advanceHangarGuide(stage) {
    if (stage <= this.state.hangar.guideStage) return;
    this.state.hangar.guideStage = Math.min(3, stage);
    this.persist();
  }

  openRules() {
    this.state.settings.tutorialSeen = true;
    this.persist();
    this.state.modal = {
      type: "rules",
      title: "30 秒上手",
      height: 420,
      lines: [
        "单指拖动战机，主武器会自动射击",
        "攻击：循环切换 3 种弹道，X-10 为 10 种",
        "技能：释放当前战机专属主动技能",
        "变身：集齐 3 个红球后手动启动 10 秒",
        "僚机：开战 15 秒后召唤专属支援编队",
        "蓝球升级弹道，绿球修复，金球展开全防屏障",
      ],
      options: [{ id: "close", label: "知道了" }],
    };
  }

  openSettings() {
    const settings = this.state.settings;
    const quality = { low: "流畅", medium: "均衡", high: "高画质" }[settings.quality];
    this.state.modal = {
      type: "settings",
      title: "声音与体验",
      height: 520,
      lines: ["设置仅保存在本机，不需要微信登录"],
      options: [
        { id: "settings:mute", label: `声音 ${settings.muted ? "已关闭" : "已开启"}` },
        { id: "settings:volume", label: `音量 ${Math.round(settings.volume * 100)}%` },
        { id: "settings:quality", label: `画质 ${quality}` },
        { id: "settings:haptics", label: `触觉 ${settings.haptics ? "已开启" : "已关闭"}` },
        { id: "settings:effects", label: `闪光与震屏 ${settings.effects === "reduced" ? "低刺激" : "完整"}` },
        { id: "settings:motion", label: `界面动画 ${settings.reducedMotion ? "已减少" : "完整"}` },
        { id: "close", label: "完成" },
      ],
    };
  }

  openMapPicker() {
    this.state.modal = {
      type: "map",
      title: "选择作战地图",
      height: 520,
      lines: [],
      maps: MAP_ORDER.map((id) => ({ id, status: this.resources.statusForMap(id) })),
      options: [],
    };
  }

  handleModalOption(id) {
    if (id.startsWith("settings:")) {
      const setting = id.slice(9);
      if (setting === "mute") this.state.settings.muted = !this.state.settings.muted;
      else if (setting === "volume") {
        const levels = [0.35, 0.7, 1];
        const next = levels.find((value) => value > this.state.settings.volume + 0.01) ?? levels[0];
        this.state.settings.volume = next;
      } else if (setting === "quality") {
        const levels = ["low", "medium", "high"];
        const next = levels[(levels.indexOf(this.state.settings.quality) + 1) % levels.length];
        this.quality.setTier(next, "手动设置");
      } else if (setting === "haptics") this.state.settings.haptics = !this.state.settings.haptics;
      else if (setting === "effects") this.state.settings.effects = this.state.settings.effects === "reduced" ? "full" : "reduced";
      else if (setting === "motion") this.state.settings.reducedMotion = !this.state.settings.reducedMotion;
      this.audio.setSettings(this.state.settings);
      if (!this.state.settings.muted) this.audio.play("uiConfirm");
      this.persist();
      this.openSettings();
      return;
    }
    if (id === "close") {
      this.state.modal = null;
      return;
    }
    if (id === "cancel-load") {
      this.launchSequence += 1;
      this.state.modal = null;
      this.toast("已留在机库，资源可在后台继续缓存");
      return;
    }
    if (id.startsWith("map:")) {
      this.state.mapId = id.slice(4);
      this.state.modal = null;
      this.persist();
      return;
    }
    if (id === "resume") {
      this.resumeCombat();
      return;
    }
    if (id === "hangar") {
      this.returnToHangar();
      return;
    }
    if (id === "restart") {
      this.state.modal = null;
      this.startCombat();
      return;
    }
    if (id === "retry-load") {
      this.state.modal = null;
      this.launchSelectedFighter();
      return;
    }
    if (id === "mission:start") {
      this.combatSystem?.beginMission();
      this.resumeCombat();
      return;
    }
    if (id === "mission:skip") {
      this.combatSystem?.skipMission();
      this.resumeCombat();
      return;
    }
    if (id.startsWith("airdrop:")) {
      this.combatSystem?.chooseAirdrop(id.slice(8));
      this.resumeCombat();
    }
  }

  async launchSelectedFighter() {
    if (this.state.fighterId === "hypersonic") {
      const value = await this.runtime.requestTextInput({ title: "输入 4 位概念暗号", maxLength: 4, numeric: true });
      if (value !== "0000") {
        this.toast("概念暗号错误，无法驾驶");
        this.audio.play("reject");
        return;
      }
    }
    const launchId = ++this.launchSequence;
    this.state.modal = {
      type: "loading",
      title: "作战资源装载",
      lines: ["正在准备战机与地图"],
      options: [{ id: "cancel-load", label: "留在机库" }],
    };
    try {
      await this.resources.ensure({ fighterId: this.state.fighterId, mapId: this.state.mapId }, (progress) => {
        if (launchId !== this.launchSequence) return;
        this.state.hangar.packageProgress = (progress.progress || 0) / 100;
        if (this.state.modal?.type === "loading") this.state.modal.lines = [`正在准备战机与地图 ${Math.round(progress.progress || 0)}%`];
      });
      if (launchId !== this.launchSequence) return;
      this.state.modal = null;
      this.startCombat();
    } catch {
      if (launchId !== this.launchSequence) return;
      this.state.modal = {
        type: "error",
        title: "资源加载失败",
        lines: ["请检查网络后重试，当前机库状态已保留"],
        options: [{ id: "retry-load", label: "重新加载" }, { id: "close", label: "返回机库" }],
      };
    }
  }

  startCombat() {
    const fighter = FIGHTERS[this.state.fighterId];
    this.state.combat = createCombatState(fighter);
    this.combatSystem = new CombatSystem({
      combat: this.state.combat,
      fighterId: this.state.fighterId,
      mapId: this.state.mapId,
      width: this.runtime.viewport.width,
      height: this.runtime.viewport.height,
      performance: this.state.stats,
      emit: (event) => this.handleCombatEvent(event),
    });
    this.state.scene = "combat";
    this.state.paused = false;
    this.state.pauseReason = "";
    this.state.modal = null;
    const now = this.runtime.now();
    this.clock.reset(now);
    this.clock.resume(now);
    this.audio.unlock();
    this.resources.load("audio-extra")
      .then(() => {
        this.audio.prepareMusic();
        this.audio.unlock();
      })
      .catch(() => this.toast("背景音乐暂未加载，战斗音效仍可使用"));
  }

  handleCombatEvent(event) {
    if (event.type === "sound") this.audio.play(event.name, event.payload);
    else if (event.type === "vibrate" && this.state.settings.haptics) this.runtime.vibrate(event.kind);
    else if (event.type === "missionPending") {
      const mission = event.mission;
      this.pause("mission");
      this.state.modal = {
        type: "mission",
        title: mission.title,
        height: 380,
        lines: [`规则：${mission.rule}`, `目标：${mission.objective}`, `奖励：${mission.reward}`],
        options: [{ id: "mission:start", label: "进入副本" }, { id: "mission:skip", label: "本局跳过" }],
      };
    } else if (event.type === "airdropChoice") {
      this.pause("airdrop");
      const options = [
        { id: "airdrop:defense", label: event.upgraded ? "高级生存补给" : "立即领取生存补给" },
        { id: "airdrop:firepower", label: event.upgraded ? "高级火力超载" : "立即领取火力超载" },
      ];
      if (!event.upgraded) options.push({ id: "airdrop:escort", label: "护送 6 秒升级奖励" });
      this.state.modal = {
        type: "airdrop",
        title: event.upgraded ? "高级空投已解锁" : "战术空投",
        height: event.upgraded ? 300 : 360,
        lines: event.upgraded ? ["护送成功，两种奖励均已强化"] : ["立即领取更安全，护送成功后奖励更强", "护送期间留在绿色范围并保护补给箱"],
        options,
      };
    } else if (event.type === "result") this.showResult(event.result);
  }

  showResult(result) {
    this.state.paused = true;
    this.clock.pause();
    this.state.stats.highScore = Math.max(this.state.stats.highScore, result.score);
    this.state.stats.fighterBest[this.state.fighterId] = Math.max(this.state.stats.fighterBest[this.state.fighterId] || 0, result.kills);
    this.state.stats.consecutiveDeaths += 1;
    this.state.stats.clearStreak = 0;
    this.persist();
    this.state.modal = {
      type: "result",
      title: "本次出击结束",
      height: 430,
      lines: [
        `得分 ${result.score} · 第 ${result.wave} 波`,
        `击坠 ${result.kills} · 最高连击 ×${result.maxCombo}`,
        `战机 ${FIGHTERS[result.fighterId].displayName}`,
        `战斗风格 ${result.style}`,
      ],
      options: [{ id: "restart", label: "重新开始" }, { id: "hangar", label: "返回机库" }],
    };
  }

  pause(reason) {
    if (this.state.scene !== "combat" || this.state.paused) return;
    this.state.paused = true;
    this.state.pauseReason = reason;
    this.clock.pause();
    this.audio.pause();
    if (reason === "manual") {
      this.state.modal = {
        type: "pause",
        title: "战斗已暂停",
        lines: ["计时、敌机、弹幕、技能和变身均已暂停"],
        options: [{ id: "resume", label: "继续战斗" }, { id: "hangar", label: "返回机库" }],
      };
    }
  }

  resumeFromBackground() {
    if (this.state.scene !== "combat" || !this.state.paused) return;
    if (["mission", "airdrop"].includes(this.state.pauseReason) || this.state.modal?.type === "result") return;
    this.state.modal = {
      type: "resume",
      title: "战斗已暂停",
      lines: ["后台期间所有战斗计时均已冻结"],
      options: [{ id: "resume", label: "继续战斗" }, { id: "hangar", label: "返回机库" }],
    };
  }

  resumeCombat() {
    if (this.state.scene !== "combat" || this.state.combat.ended) return;
    this.state.modal = null;
    this.state.paused = false;
    this.state.pauseReason = "";
    this.clock.resume(this.runtime.now());
    this.audio.resume();
  }

  returnToHangar() {
    this.launchSequence += 1;
    this.state.scene = "hangar";
    this.state.paused = false;
    this.state.pauseReason = "";
    this.state.modal = null;
    this.combatTouches.clear();
    this.combatSystem = null;
    this.clock.pause();
    this.renderer.setFighter(this.state.fighterId);
    this.persist();
  }

  onResize() {
    this.renderer.resize(this.runtime.viewport);
    this.combatSystem?.resize(this.runtime.viewport.width, this.runtime.viewport.height);
    if (this.state.scene !== "combat") return;
    if (this.runtime.viewport.width > this.runtime.viewport.height) {
      if (!this.state.paused) this.pause("orientation");
      this.state.modal = {
        type: "orientation",
        title: "请旋转为竖屏",
        lines: ["战斗已暂停，恢复竖屏后可继续"],
        options: [],
      };
    } else if (this.state.modal?.type === "orientation") {
      this.state.modal = {
        type: "resume",
        title: "方向已恢复",
        lines: ["地图、战机与战斗计时保持不变"],
        options: [{ id: "resume", label: "继续战斗" }, { id: "hangar", label: "返回机库" }],
      };
    }
  }

  onQualityChanged(tier, reason) {
    this.state.settings.quality = tier;
    this.renderer.setQuality(tier);
    this.persist();
    if (this.state.scene === "combat") this.toast(`画质已切换为${{ low: "流畅", medium: "均衡", high: "高" }[tier]}档：${reason}`);
  }

  onMemoryWarning() {
    this.quality.setTier("low", "系统内存告警");
    this.renderer.releaseUnused(this.state.fighterId);
    this.toast("已释放非当前资源并切换流畅画质");
  }

  toast(text) {
    this.state.toast = { text, time: 2.2 };
  }

  persist() {
    this.runtime.setStorage(STORAGE_KEY, serializeSettings(this.state));
  }

  dispose() {
    if (this.frame) this.runtime.cancelFrame(this.frame);
    this.unsubscribers.forEach((unsubscribe) => unsubscribe?.());
    this.audio.dispose();
    this.renderer.dispose();
  }
}
