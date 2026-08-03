export const FIGHTER_ABILITIES = {
  j20: {
    style: "command-lock",
    skill: { phases: ["扫描锁定", "龙牙齐射", "龙脊贯穿"], targeting: "priority", description: "锁定高价值目标，无人翼追踪齐射后由中央轨炮贯穿。" },
    upgrades: [
      { id: "dragon-split", name: "龙牙分裂", description: "追踪弹命中后分裂为两枚脉冲弹" },
      { id: "dragon-mark", name: "龙印扩散", description: "击破标记目标时向附近敌机传递标记" },
      { id: "dragon-wing", name: "无人翼指挥", description: "主武器额外增加一个发射挂点" },
    ],
  },
  j35: {
    style: "twin-intercept",
    skill: { phases: ["双线确认", "左右切入", "交叉截击"], targeting: "marked", description: "本体与双隼虚影从三条航线交叉攻击双锁目标。" },
    upgrades: [
      { id: "falcon-lock", name: "快速双锁", description: "追踪与激光更快建立双线标记" },
      { id: "falcon-cross", name: "交叉刃轨", description: "轨炮改为交叉弹道并提高命中伤害" },
      { id: "falcon-reset", name: "截击回收", description: "击破标记目标缩短技能冷却" },
    ],
  },
  faxx: {
    style: "drone-formation",
    skill: { phases: ["僚机展开", "三线合围", "中心爆破"], targeting: "formation", description: "无人僚机从左右航线压缩弹幕并在中心交汇爆破。" },
    upgrades: [
      { id: "falcon-drone", name: "增援无人翼", description: "自动僚机数量增加一架" },
      { id: "falcon-copy", name: "完整复制", description: "僚机复制武器时保留特殊弹道" },
      { id: "falcon-focus", name: "编队集火", description: "僚机对精英和部件伤害提高" },
    ],
  },
  f22: {
    style: "ghost-execute",
    skill: { phases: ["隐身", "幽灵锁定", "连续处决"], targeting: "execute", description: "短暂隐身并依次处决低血量标记目标。" },
    upgrades: [
      { id: "ghost-spread", name: "标记传染", description: "标记目标被击破后传递幽灵标记" },
      { id: "ghost-threshold", name: "处决窗口", description: "提高普通敌机的处决生命阈值" },
      { id: "ghost-cloak", name: "延长隐身", description: "技能无敌时间延长" },
    ],
  },
  typhoon: {
    style: "storm-pierce",
    skill: { phases: ["长矛校准", "风暴蓄力", "全屏贯穿"], targeting: "line", description: "沿玩家所在直线发射会随贯穿次数增粗的风暴长矛。" },
    upgrades: [
      { id: "storm-width", name: "长矛扩径", description: "轨炮碰撞宽度和贯穿范围提高" },
      { id: "storm-chain", name: "贯穿增幅", description: "每次贯穿进一步提高弹体伤害" },
      { id: "storm-refund", name: "破阵回能", description: "连续贯穿时加速技能冷却" },
    ],
  },
  rafale: {
    style: "phase-resonance",
    skill: { phases: ["双相展开", "三次交汇", "共振引爆"], targeting: "orbit", description: "两颗相反相位核心回旋前进，三次交汇并引爆共振。" },
    upgrades: [
      { id: "resonance-fast", name: "快速共振", description: "共振引爆阈值降低一层" },
      { id: "resonance-chain", name: "连锁扩散", description: "共振爆炸向附近目标附加层数" },
      { id: "resonance-arc", name: "双轨增幅", description: "双轨激光命中后追加邻近共振伤害" },
    ],
  },
  gripen: {
    style: "graze-overclock",
    skill: { phases: ["超频解锁", "无人翼回旋", "轨钉齐射"], targeting: "graze", description: "消耗擦弹超频层数，转化为多轮高速轨道齐射。" },
    upgrades: [
      { id: "graze-window", name: "危险感知", description: "略微扩大擦弹判定范围" },
      { id: "graze-retaliate", name: "擦弹反射", description: "每次擦弹向最近目标反射脉冲" },
      { id: "graze-keep", name: "超频保持", description: "受伤时保留更多超频层数" },
    ],
  },
  su57: {
    style: "armor-counter",
    skill: { phases: ["肩炮破甲", "反应聚能", "新星破城"], targeting: "armor", description: "先破甲再释放中央新星重炮，反击层数扩大爆炸。" },
    upgrades: [
      { id: "armor-charge", name: "反应增压", description: "护盾破裂也能获得反击层数" },
      { id: "armor-blast", name: "新星扩张", description: "重炮爆炸半径提高" },
      { id: "armor-shield", name: "反击护盾", description: "满层释放技能后获得一层护盾" },
    ],
  },
  hypersonic: {
    style: "hyper-chain",
    skill: { phases: ["全屏警告", "核裁决", "三叉光阵"], targeting: "screen", description: "清除敌弹并裁决普通敌机，形态链满时追加三叉光阵。" },
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
