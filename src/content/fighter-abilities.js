export const FIGHTER_ABILITIES = {
  j20: {
    style: "command-lock",
    passive: { name: "龙脊贯穿", interval: 6, accelerator: "击破标记目标加速蓄能", phases: ["扫描锁定", "龙牙齐射", "龙脊贯穿"], targeting: "priority", description: "持续射击自动锁定高价值目标，并释放中央贯穿光束。" },
    upgrades: [
      { id: "dragon-split", name: "龙牙分裂", description: "追踪弹命中后分裂为两枚脉冲弹" },
      { id: "dragon-mark", name: "龙印扩散", description: "击破标记目标时向附近敌机传递标记" },
      { id: "dragon-wing", name: "无人翼指挥", description: "主武器额外增加一个发射挂点" },
    ],
  },
  j35: {
    style: "twin-intercept",
    passive: { name: "双隼截击", interval: 7, accelerator: "双线标记越多蓄能越快", phases: ["双线确认", "左右切入", "交叉截击"], targeting: "marked", description: "双隼虚影自动从左右航线交叉截击标记目标。" },
    upgrades: [
      { id: "falcon-lock", name: "快速双锁", description: "追踪与激光更快建立双线标记" },
      { id: "falcon-cross", name: "交叉刃轨", description: "轨炮改为交叉弹道并提高命中伤害" },
      { id: "falcon-reset", name: "截击回收", description: "击破标记目标加速被动蓄能" },
    ],
  },
  faxx: {
    style: "drone-formation",
    passive: { name: "无人翼编队", interval: 8, accelerator: "持续射击稳定蓄能", phases: ["僚机展开", "三线合围", "中心爆破"], targeting: "formation", description: "自动召唤无人僚机复制当前火力，并在前方合围爆破。" },
    upgrades: [
      { id: "falcon-drone", name: "增援无人翼", description: "自动僚机数量增加一架" },
      { id: "falcon-copy", name: "完整复制", description: "僚机复制武器时保留特殊弹道" },
      { id: "falcon-focus", name: "编队集火", description: "僚机对精英和部件伤害提高" },
    ],
  },
  f22: {
    style: "ghost-execute",
    passive: { name: "幽灵处决", interval: 7, accelerator: "未受伤时蓄能加快", phases: ["隐身", "幽灵锁定", "连续处决"], targeting: "execute", description: "自动进入短暂隐身，并处决低血量标记目标。" },
    upgrades: [
      { id: "ghost-spread", name: "标记传染", description: "标记目标被击破后传递幽灵标记" },
      { id: "ghost-threshold", name: "处决窗口", description: "提高普通敌机的处决生命阈值" },
      { id: "ghost-cloak", name: "延长隐身", description: "被动隐身时间延长" },
    ],
  },
  typhoon: {
    style: "storm-pierce",
    passive: { name: "风暴长矛", interval: 5, accelerator: "贯穿命中加速蓄能", phases: ["长矛校准", "风暴蓄力", "全屏贯穿"], targeting: "line", description: "连续射击后自动释放宽型直线轨炮，贯穿整列敌机。" },
    upgrades: [
      { id: "storm-width", name: "长矛扩径", description: "轨炮碰撞宽度和贯穿范围提高" },
      { id: "storm-chain", name: "贯穿增幅", description: "每次贯穿进一步提高弹体伤害" },
      { id: "storm-refund", name: "破阵回能", description: "连续贯穿时加速被动蓄能" },
    ],
  },
  rafale: {
    style: "phase-resonance",
    passive: { name: "双相共振", interval: 7, accelerator: "共振层数加速蓄能", phases: ["双相展开", "三次交汇", "共振引爆"], targeting: "orbit", description: "自动释放双相核心，在前方交汇并连续引爆共振。" },
    upgrades: [
      { id: "resonance-fast", name: "快速共振", description: "共振引爆阈值降低一层" },
      { id: "resonance-chain", name: "连锁扩散", description: "共振爆炸向附近目标附加层数" },
      { id: "resonance-arc", name: "双轨增幅", description: "双轨激光命中后追加邻近共振伤害" },
    ],
  },
  gripen: {
    style: "graze-overclock",
    passive: { name: "擦弹超频", interval: 10, accelerator: "擦弹层数大幅加速蓄能", phases: ["超频解锁", "无人翼回旋", "轨钉齐射"], targeting: "graze", description: "擦弹积累超频，满蓄能后自动转化为高速轨道齐射。" },
    upgrades: [
      { id: "graze-window", name: "危险感知", description: "略微扩大擦弹判定范围" },
      { id: "graze-retaliate", name: "擦弹反射", description: "每次擦弹向最近目标反射脉冲" },
      { id: "graze-keep", name: "超频保持", description: "受伤时保留更多超频层数" },
    ],
  },
  su57: {
    style: "armor-counter",
    passive: { name: "装甲反击", interval: 9, accelerator: "承伤与护盾破裂加速蓄能", phases: ["肩炮破甲", "反应聚能", "新星破城"], targeting: "armor", description: "承伤积蓄反击能量，自动释放中央新星重炮。" },
    upgrades: [
      { id: "armor-charge", name: "反应增压", description: "护盾破裂也能获得反击层数" },
      { id: "armor-blast", name: "新星扩张", description: "重炮爆炸半径提高" },
      { id: "armor-shield", name: "反击护盾", description: "满层触发被动后获得一层护盾" },
    ],
  },
  hypersonic: {
    style: "hyper-chain",
    passive: { name: "三叉光阵", interval: 8, accelerator: "切换不同武器加速蓄能", phases: ["全屏警告", "核裁决", "三叉光阵"], targeting: "screen", description: "自动清除近身敌弹并释放三叉裁决光阵。" },
    upgrades: [
      { id: "hyper-chain", name: "形态链增幅", description: "切换不同武器时提高英雄火力" },
      { id: "hyper-cooling", name: "超维冷却", description: "激光散热速度提高" },
      { id: "hyper-array", name: "三叉矩阵", description: "满形态链核裁决追加三束贯穿光" },
    ],
  },
};

export function fighterAbility(fighterId) {
  return FIGHTER_ABILITIES[fighterId] || FIGHTER_ABILITIES.j20;
}

export function fighterUpgradeChoices(fighterId, owned = []) {
  const ownedSet = new Set(owned);
  const available = fighterAbility(fighterId).upgrades.filter((item) => !ownedSet.has(item.id));
  return (available.length ? available : fighterAbility(fighterId).upgrades).slice(0, 3);
}
