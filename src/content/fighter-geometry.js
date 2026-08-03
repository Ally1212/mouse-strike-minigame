export const AIRFRAME_SPECS = {
  commander: { body: [18, 150], wing: [68, 58, 0.7], canard: 24, tails: 2, engines: 2, bodyColor: 0x6d8797, underside: 0x183342 },
  falcon: { body: [17, 132], wing: [54, 50, 0.58], canard: 8, tails: 2, engines: 2, bodyColor: 0x607b89, underside: 0x16313d },
  specter: { body: [22, 142], wing: [78, 66, 0.9], canard: 0, tails: 0, engines: 2, bodyColor: 0x758ca5, underside: 0x1d3244 },
  hunter: { body: [20, 140], wing: [58, 54, 0.62], canard: 0, tails: 2, engines: 2, bodyColor: 0x748590, underside: 0x1d3039 },
  lancer: { body: [18, 136], wing: [58, 58, 0.72], canard: 27, tails: 1, engines: 2, bodyColor: 0x667f8d, underside: 0x172f3a },
  dualist: { body: [19, 133], wing: [55, 55, 0.68], canard: 20, tails: 1, engines: 2, bodyColor: 0x647d88, underside: 0x20323b },
  skirmisher: { body: [15, 122], wing: [48, 46, 0.48], canard: 18, tails: 1, engines: 1, bodyColor: 0x607d86, underside: 0x17323b },
  siege: { body: [25, 145], wing: [72, 62, 0.78], canard: 0, tails: 2, engines: 2, bodyColor: 0x7a8c98, underside: 0x293943 },
  hypersonic: { body: [21, 156], wing: [82, 70, 0.92], canard: 28, tails: 2, engines: 3, bodyColor: 0x477992, underside: 0x102f41 },
};

export function fighterCombatScale(transformed = false) {
  return transformed ? 1.34 : 1.12;
}

export function fighterAirframeSpec(fighterOrProfile) {
  const profile = typeof fighterOrProfile === "string" ? fighterOrProfile : fighterOrProfile?.rig?.profile;
  return AIRFRAME_SPECS[profile] || AIRFRAME_SPECS.commander;
}

export function fighterSilhouetteGeometry(fighter, x, y, scale = 1) {
  const profile = fighter.rig.profile;
  const spec = fighterAirframeSpec(fighter);
  const bodyWidth = spec.body[0];
  const bodyLength = spec.body[1];
  const wingSpan = spec.wing[0];
  const wingLength = spec.wing[1];
  const taper = spec.wing[2];
  const halfLength = 31 * scale;
  const halfBody = Math.max(5.5, bodyWidth / bodyLength * 47) * scale;
  const span = Math.max(23, wingSpan / bodyLength * 77) * scale;
  const wingRootY = y - halfLength * (profile === "specter" ? 0.38 : 0.2);
  const wingTipY = wingRootY + halfLength * (0.34 + taper * 0.28);
  const wingRearY = wingRootY + halfLength * (0.58 + wingLength / bodyLength * 0.28);
  const tailY = y + halfLength * 0.72;
  const asymmetric = profile === "dualist" ? 1.12 : 1;
  const outline = [
    { x, y: y - halfLength },
    { x: x + halfBody * 0.48, y: y - halfLength * 0.72 },
    { x: x + halfBody, y: wingRootY },
    { x: x + span * asymmetric, y: wingTipY },
    { x: x + span * (0.58 + taper * 0.16), y: wingRearY },
    { x: x + halfBody * 1.12, y: y + halfLength * 0.34 },
    { x: x + halfBody * 0.62, y: tailY },
    { x, y: y + halfLength * 0.58 },
    { x: x - halfBody * 0.62, y: tailY },
    { x: x - halfBody * 1.12, y: y + halfLength * 0.34 },
    { x: x - span * (0.58 + taper * 0.16), y: wingRearY },
    { x: x - span, y: wingTipY },
    { x: x - halfBody, y: wingRootY },
    { x: x - halfBody * 0.48, y: y - halfLength * 0.72 },
  ];
  const canards = spec.canard > 0 ? [
    [{ x: x - halfBody * 0.35, y: y - halfLength * 0.6 }, { x: x - spec.canard / bodyLength * 55 * scale, y: y - halfLength * 0.35 }, { x: x - halfBody * 0.42, y: y - halfLength * 0.28 }],
    [{ x: x + halfBody * 0.35, y: y - halfLength * 0.6 }, { x: x + spec.canard / bodyLength * 55 * scale, y: y - halfLength * 0.35 }, { x: x + halfBody * 0.42, y: y - halfLength * 0.28 }],
  ] : [];
  const tailSpan = Math.max(7, spec.tails === 0 ? 0 : spec.tails === 1 ? 8 : 13) * scale;
  const tails = spec.tails === 0 ? [] : spec.tails === 1
    ? [[{ x, y: y + halfLength * 0.22 }, { x: x + tailSpan * 0.35, y: y + halfLength * 0.7 }, { x: x - tailSpan * 0.35, y: y + halfLength * 0.7 }]]
    : [-1, 1].map((side) => [
      { x: x + side * halfBody * 0.65, y: y + halfLength * 0.18 },
      { x: x + side * tailSpan, y: y + halfLength * 0.72 },
      { x: x + side * halfBody * 0.18, y: y + halfLength * 0.52 },
    ]);
  const engineGap = spec.engines === 1 ? 0 : spec.engines === 3 ? 7 : 6.5;
  const engines = Array.from({ length: spec.engines }, (_, index) => ({
    x: x + (index - (spec.engines - 1) / 2) * engineGap * scale,
    y: y + halfLength * 0.56,
  }));
  const fuselage = [
    { x, y: y - halfLength },
    { x: x + halfBody * 0.58, y: y - halfLength * 0.58 },
    { x: x + halfBody * 0.9, y: y - halfLength * 0.04 },
    { x: x + halfBody * 0.62, y: y + halfLength * 0.55 },
    { x, y: y + halfLength * 0.66 },
    { x: x - halfBody * 0.62, y: y + halfLength * 0.55 },
    { x: x - halfBody * 0.9, y: y - halfLength * 0.04 },
    { x: x - halfBody * 0.58, y: y - halfLength * 0.58 },
  ];
  const wingPanels = [
    [
      { x: x - halfBody * 0.62, y: wingRootY },
      { x: x - span, y: wingTipY },
      { x: x - span * (0.58 + taper * 0.16), y: wingRearY },
      { x: x - halfBody * 0.86, y: y + halfLength * 0.28 },
    ],
    [
      { x: x + halfBody * 0.62, y: wingRootY },
      { x: x + span * asymmetric, y: wingTipY },
      { x: x + span * (0.58 + taper * 0.16), y: wingRearY },
      { x: x + halfBody * 0.86, y: y + halfLength * 0.28 },
    ],
  ];
  const intakeY = y - halfLength * 0.13;
  const intakes = [-1, 1].map((side) => [
    { x: x + side * halfBody * 0.42, y: intakeY - 5 * scale },
    { x: x + side * halfBody * 1.12, y: intakeY + 1 * scale },
    { x: x + side * halfBody * 0.7, y: intakeY + 12 * scale },
    { x: x + side * halfBody * 0.35, y: intakeY + 8 * scale },
  ]);
  const weaponBays = [-1, 1].map((side) => ({
    x1: x + side * halfBody * 0.48,
    y1: y + halfLength * 0.02,
    x2: x + side * halfBody * 0.55,
    y2: y + halfLength * 0.4,
  }));
  const panelLines = [
    { x1: x - halfBody * 0.72, y1: y - halfLength * 0.36, x2: x - span * 0.58, y2: wingTipY + 2 * scale },
    { x1: x + halfBody * 0.72, y1: y - halfLength * 0.36, x2: x + span * 0.58, y2: wingTipY + 2 * scale },
    { x1: x - halfBody * 0.65, y1: y + halfLength * 0.24, x2: x - span * 0.42, y2: wingRearY - 1 * scale },
    { x1: x + halfBody * 0.65, y1: y + halfLength * 0.24, x2: x + span * 0.42, y2: wingRearY - 1 * scale },
  ];
  return {
    profile,
    outline,
    canards,
    tails,
    engines,
    fuselage,
    wingPanels,
    intakes,
    weaponBays,
    panelLines,
    palette: {
      body: `#${spec.bodyColor.toString(16).padStart(6, "0")}`,
      underside: `#${spec.underside.toString(16).padStart(6, "0")}`,
    },
    cockpit: { x, y: y - halfLength * 0.42, radius: Math.max(3.2, halfBody * 0.48) },
    spine: { x1: x, y1: y - halfLength * 0.78, x2: x, y2: y + halfLength * 0.44 },
    hardpoints: {
      nose: { x, y: y - halfLength },
      center: { x, y: y - halfLength * 0.52 },
      leftWing: { x: x - span * 0.55, y: wingTipY },
      rightWing: { x: x + span * 0.55, y: wingTipY },
      leftBay: { x: x - halfBody * 0.78, y: y - halfLength * 0.04 },
      rightBay: { x: x + halfBody * 0.78, y: y - halfLength * 0.04 },
      droneLeft: { x: x - span * 0.72, y: wingRearY },
      droneRight: { x: x + span * 0.72, y: wingRearY },
    },
  };
}

export function fighterWeaponHardpointKeys(pattern = "pulse", count = 3) {
  const safeCount = Math.max(1, Math.trunc(Number(count) || 1));
  if (pattern === "seeker") {
    if (safeCount === 1) return ["nose"];
    if (safeCount === 2) return ["leftBay", "rightBay"];
    if (safeCount === 3) return ["leftBay", "nose", "rightBay"];
    if (safeCount === 4) return ["leftWing", "leftBay", "rightBay", "rightWing"];
    if (safeCount === 5) return ["leftWing", "leftBay", "nose", "rightBay", "rightWing"];
    const left = Math.floor(safeCount / 2);
    return [
      ...Array.from({ length: left }, (_, index) => index % 2 ? "leftBay" : "leftWing"),
      ...(safeCount % 2 ? ["nose"] : []),
      ...Array.from({ length: left }, (_, index) => (left - index - 1) % 2 ? "rightBay" : "rightWing"),
    ];
  }
  if (pattern === "heavy") {
    if (safeCount === 1) return ["center"];
    if (safeCount === 2) return ["leftBay", "rightBay"];
    const sideCount = Math.floor(safeCount / 2);
    return [
      ...Array(sideCount).fill("leftBay"),
      ...(safeCount % 2 ? ["center"] : []),
      ...Array(sideCount).fill("rightBay"),
    ];
  }
  if (pattern === "drone") {
    const sideCount = Math.floor(safeCount / 2);
    return [
      ...Array(sideCount).fill("droneLeft"),
      ...(safeCount % 2 ? ["nose"] : []),
      ...Array(sideCount).fill("droneRight"),
    ];
  }
  if (safeCount === 1) return ["nose"];
  if (safeCount === 2) return ["leftWing", "rightWing"];
  const sideCount = Math.floor(safeCount / 2);
  return [
    ...Array(sideCount).fill("leftWing"),
    ...(safeCount % 2 ? ["nose"] : []),
    ...Array(sideCount).fill("rightWing"),
  ];
}

export function fighterWeaponOrigins(fighter, x, y, scale = 1, pattern = "pulse", count = 1) {
  const hardpoints = fighterSilhouetteGeometry(fighter, x, y, scale).hardpoints;
  const safeCount = Math.max(1, Math.trunc(Number(count) || 1));
  const keys = fighterWeaponHardpointKeys(pattern, safeCount);
  return Array.from({ length: safeCount }, (_, index) => {
    const key = keys[index % keys.length];
    return { ...hardpoints[key], key };
  });
}
