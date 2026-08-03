# 手指突击队：空战机库

一款面向微信小游戏平台的竖屏轻量空战游戏。玩家可以在单屏机库中选择九架战机、切换预览形态与作战地图，然后进入自动射击、技能、变身、僚机和随机事件组成的空战关卡。

项目采用 JavaScript、Three.js、Canvas 与 Web Audio API 开发，不依赖 WXML 页面框架；源码可在浏览器中预览，并构建为微信小游戏可导入的 `dist/` 目录。

## 核心功能

- 九架战机循环选择，每次完整展示上一架、当前战机和下一架三张卡片
- 支持点击、左右拖动、快速滑动、惯性判断和九点分页直达
- 飞行、机甲、强袭和专属战术四种机库预览
- 五张作战地图以及地图结构、事件、分包状态和加载反馈
- 自动射击、三种攻击形态、主动技能、手动变身与僚机系统
- 敌机、Boss、补给、陨石、空投和五类随机任务
- 动态画质、减少动画、音量、触觉和视觉效果设置
- 原创复古 8-bit 街机风界面与战斗音效
- 微信小游戏生命周期、分包加载、缓存和本地设置适配

## 技术栈

- JavaScript ES Modules
- Three.js 0.185.1
- HTML5 Canvas / WebGL
- Web Audio API / 微信小游戏音频接口
- Vitest
- Playwright
- esbuild

## 环境要求

- Node.js 20 或更高版本
- npm
- 微信开发者工具稳定版
- 微信小游戏基础库 2.19.0 或更高版本

## 安装与本地预览

```bash
npm install
npm run preview
```

浏览器预览地址默认为：

```text
http://127.0.0.1:4188/
```

## 构建微信小游戏

```bash
npm run build
```

构建完成后会生成 `dist/`。使用微信开发者工具打开仓库根目录，工具会根据 `project.config.json` 将 `dist/` 识别为小游戏目录。

首次使用时请在微信开发者工具中配置自己有权限的小游戏 AppID。`project.private.config.json` 属于本机配置，已被 Git 忽略。

## 测试与验收

运行单元测试：

```bash
npm test
```

运行浏览器端流程测试：

```bash
npm run test:e2e
```

运行完整本地门禁：

```bash
npm run check
```

完整门禁包含单元测试、E2E、20 分钟逻辑耐久模拟、生产构建和基础验收脚本。详细验收标准与当前状态参见：

- [REQUIREMENTS.md](./REQUIREMENTS.md)
- [ACCEPTANCE.md](./ACCEPTANCE.md)
- [ACCEPTANCE_STATUS.md](./ACCEPTANCE_STATUS.md)

## 操作说明

### 机库

- 左右滑动或点击左右卡片切换战机
- 点击分页圆点直接选择对应战机
- 拖动战机模型调整观察角度
- 点击四个预览按钮查看不同姿态
- 选择地图后点击“驾驶出击”

### 战斗

- 拖动战机移动，主武器自动射击
- “攻击”切换当前攻击形态
- “技能”释放战机专属技能
- 收集三个变身核心后点击“变身”
- 点击“僚机”召唤支援单位

## 项目结构

```text
src/
  app/          游戏启动、场景与输入协调
  audio/        音乐和原创合成音效
  content/      战机、地图、规则和任务配置
  core/         战斗系统、时钟、对象池和动态画质
  platform/     浏览器与微信小游戏运行时适配
  qa/           本地质量验证入口
  render/       Three.js 战机模型与 Canvas/WebGL 界面
  ui/           响应式布局与触控安全区
tests/          单元测试与 Playwright E2E
scripts/        构建、耐久和验收脚本
tools/preview/  浏览器预览入口
```

## 屏幕适配

机库与主要交互已覆盖以下竖屏尺寸：

- 320 × 568
- 375 × 812
- 390 × 844

主要操作区域按照不小于 44 × 44 逻辑像素设计。

## 素材与版权

第三方依赖、图片和音频来源见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) 与 [docs/FIGHTER_IMAGE_CREDITS.md](./docs/FIGHTER_IMAGE_CREDITS.md)。项目的复古街机音效由代码原创合成，不包含《魂斗罗》或其他商业游戏的原始音频素材。

## 发布说明

本地自动化通过不等同于微信真机验收。正式发布前仍需在真实 AppID、微信开发者工具稳定版、iOS/Android 真机及弱网环境中完成冷启动、帧率、内存、音频、触觉和分包缓存验证。
