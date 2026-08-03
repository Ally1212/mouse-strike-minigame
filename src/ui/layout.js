export function contains(rect, x, y) {
  return Boolean(rect) && x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

export function computeHangarLayout(width, height, safeArea = {}, menuButton = null) {
  const safeTop = Math.max(10, safeArea.top || 0);
  const safeBottom = Math.max(12, height - (safeArea.bottom || height));
  const pad = Math.max(12, Math.min(18, width * 0.04));
  const headerHeight = 44;
  const footerHeight = 62;
  const cardsHeight = 56;
  const infoHeight = Math.max(94, Math.min(112, height * 0.14));
  const headerY = Math.max(safeTop + 4, Number.isFinite(menuButton?.top) ? menuButton.top : 0);
  const headerRight = Number.isFinite(menuButton?.left) ? menuButton.left - 8 : width - pad;
  const footerY = height - safeBottom - footerHeight - 10;
  const cardsY = footerY - cardsHeight - 8;
  const infoY = cardsY - infoHeight - 8;
  const previewY = headerY + headerHeight + 8;
  const previewHeight = Math.max(180, infoY - previewY - 8);
  const rules = { x: headerRight - 50, y: headerY, width: 50, height: 44, id: "rules" };
  const sound = { x: rules.x - 58, y: headerY, width: 50, height: 44, id: "sound" };
  const previewButtons = ["flight", "transform", "assault", "tactical"].map((id, index) => ({
    id,
    x: pad + index * ((width - pad * 2) / 4),
    y: previewY + previewHeight - 48,
    width: (width - pad * 2) / 4,
    height: 44,
  }));
  const cardGap = 8;
  const cardWidth = (width - pad * 2 - cardGap * 2) / 3;
  const fighterCards = [-1, 0, 1].map((offset, index) => ({
    offset,
    x: pad + index * (cardWidth + cardGap),
    y: cardsY,
    width: cardWidth,
    height: cardsHeight,
    index,
  }));
  const fighterArrowSize = 44;
  const fighterPrev = {
    id: "fighter-prev",
    x: fighterCards[0].x,
    y: cardsY + (cardsHeight - fighterArrowSize) / 2,
    width: fighterArrowSize,
    height: fighterArrowSize,
  };
  const fighterNext = {
    id: "fighter-next",
    x: fighterCards[2].x + fighterCards[2].width - fighterArrowSize,
    y: cardsY + (cardsHeight - fighterArrowSize) / 2,
    width: fighterArrowSize,
    height: fighterArrowSize,
  };
  const fighterProgress = {
    id: "fighter-progress",
    x: Math.max(pad + fighterArrowSize, width / 2 - 102),
    y: cardsY + 34,
    width: Math.min(204, width - (pad + fighterArrowSize) * 2),
    height: 44,
  };
  const mapWidth = Math.max(108, Math.min(142, width * 0.34));
  return {
    pad,
    header: { x: pad, y: headerY, width: Math.max(120, headerRight - pad), height: headerHeight },
    preview: { x: 0, y: previewY, width, height: previewHeight },
    info: { x: pad, y: infoY, width: width - pad * 2, height: infoHeight },
    cards: { x: 0, y: cardsY, width, height: cardsHeight },
    fighterCards,
    fighterPrev,
    fighterNext,
    fighterProgress,
    previewButtons,
    rules,
    sound,
    footer: { x: pad, y: footerY, width: width - pad * 2, height: footerHeight },
    map: { id: "map", x: pad, y: footerY + 6, width: mapWidth, height: 50 },
    start: { id: "start", x: pad + mapWidth + 8, y: footerY + 6, width: width - pad * 2 - mapWidth - 8, height: 50 },
  };
}

export function computeCombatLayout(width, height, safeArea = {}, menuButton = null) {
  const safeTop = Math.max(10, safeArea.top || 0);
  const safeBottom = Math.max(12, height - (safeArea.bottom || height));
  const pad = 12;
  const mainButton = Math.max(62, Math.min(70, width * 0.18));
  const smallButton = Math.max(50, Math.min(56, width * 0.14));
  const gap = 8;
  const baseY = height - safeBottom - mainButton - 12;
  const hudY = Math.max(safeTop + 4, Number.isFinite(menuButton?.bottom) ? menuButton.bottom + 8 : 0);
  const moveY = hudY + 68;
  const skillX = width - pad - mainButton;
  const transformY = baseY - smallButton - gap;
  return {
    hud: { x: pad, y: hudY, width: width - pad * 2, height: 58 },
    pause: { id: "pause", x: width - pad - 52, y: hudY + 7, width: 52, height: 44 },
    actions: {
      form: { id: "form", x: skillX - smallButton - gap, y: transformY, width: smallButton, height: smallButton },
      skill: { id: "skill", x: skillX, y: baseY, width: mainButton, height: mainButton },
      transform: { id: "transform", x: skillX, y: transformY, width: smallButton, height: smallButton },
      wingman: { id: "wingman", x: skillX - smallButton - gap, y: baseY + mainButton - smallButton, width: smallButton, height: smallButton },
    },
    moveArea: { x: 0, y: moveY, width, height: Math.max(0, baseY + mainButton - moveY) },
  };
}
