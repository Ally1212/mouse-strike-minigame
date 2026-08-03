import * as THREE from "three";

const BLUEPRINTS = {
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

const MOTIONS = {
  commander: { fold: 0.42, sweep: 0.18, lift: 9, outward: 2, canard: 0.52, tail: 0.34, tailLift: 12 },
  falcon: { fold: 0.82, sweep: -0.2, lift: 12, outward: 5, canard: 0.28, tail: 0.48, tailLift: 14 },
  specter: { fold: -0.24, sweep: 0.58, lift: 8, outward: 13, canard: 0, tail: 0, tailLift: 0 },
  hunter: { fold: 0.48, sweep: 0.28, lift: 8, outward: 3, canard: 0, tail: 0.38, tailLift: 12 },
  lancer: { fold: 0.76, sweep: 0.66, lift: 10, outward: 0, canard: 0.62, tail: 0.24, tailLift: 15 },
  dualist: { fold: 0.56, sweep: -0.5, lift: 11, outward: 8, canard: -0.42, tail: 0.2, tailLift: 10 },
  skirmisher: { fold: 0.96, sweep: 0.16, lift: 14, outward: 16, canard: 0.54, tail: 0.7, tailLift: 18 },
  siege: { fold: 0.16, sweep: 0.34, lift: 15, outward: 4, canard: 0, tail: 0.22, tailLift: 8 },
  hypersonic: { fold: 1.08, sweep: 0.62, lift: 17, outward: 12, canard: 0.78, tail: 0.56, tailLift: 20 },
};

function material(color, metalness = 0.78, roughness = 0.28, emissive = 0x000000, intensity = 0) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness,
    roughness,
    clearcoat: 0.42,
    clearcoatRoughness: 0.19,
    emissive,
    emissiveIntensity: intensity,
    side: THREE.DoubleSide,
  });
}

function prismGeometry(points, height = 6) {
  const contour = points.map(([x, z]) => new THREE.Vector2(x, z));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  const vertices = [];
  const half = height / 2;
  points.forEach(([x, z]) => vertices.push(x, half, z));
  points.forEach(([x, z]) => vertices.push(x, -half, z));
  const count = points.length;
  const indices = [];
  faces.forEach(([a, b, c]) => {
    indices.push(a, b, c);
    indices.push(c + count, b + count, a + count);
  });
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    indices.push(index, next, next + count, index, next + count, index + count);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function verticalPlateGeometry(points, depth = 4) {
  const contour = points.map(([x, y]) => new THREE.Vector2(x, y));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  const vertices = [];
  const half = depth / 2;
  points.forEach(([x, y]) => vertices.push(x, y, half));
  points.forEach(([x, y]) => vertices.push(x, y, -half));
  const count = points.length;
  const indices = [];
  faces.forEach(([a, b, c]) => {
    indices.push(a, b, c);
    indices.push(c + count, b + count, a + count);
  });
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    indices.push(index, next, next + count, index, next + count, index + count);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function mesh(geometry, mat, name, position = [0, 0, 0], rotation = [0, 0, 0]) {
  const result = new THREE.Mesh(geometry, mat);
  result.name = name;
  result.position.set(...position);
  result.rotation.set(...rotation);
  result.castShadow = true;
  result.receiveShadow = true;
  return result;
}

function remember(part, metadata = {}) {
  part.userData = {
    ...part.userData,
    ...metadata,
    basePosition: part.position.clone(),
    baseRotation: part.rotation.clone(),
    baseScale: part.scale.clone(),
  };
  return part;
}

function resetPart(part) {
  const data = part.userData;
  part.position.copy(data.basePosition);
  part.rotation.copy(data.baseRotation);
  part.scale.copy(data.baseScale);
}

function bodyPoints(width, length, profile) {
  const half = width / 2;
  const nose = -length / 2;
  const tail = length / 2;
  const shoulder = profile === "specter" ? 1.38 : profile === "siege" ? 1.2 : profile === "hypersonic" ? 1.12 : 1;
  const waist = profile === "lancer" || profile === "skirmisher" ? 0.7 : 0.9;
  return [
    [0, nose],
    [half * 0.28, nose + length * 0.07],
    [half * 0.7, nose + length * 0.21],
    [half * shoulder, nose + length * 0.37],
    [half * waist, tail - length * 0.18],
    [half * 0.48, tail],
    [-half * 0.48, tail],
    [-half * waist, tail - length * 0.18],
    [-half * shoulder, nose + length * 0.37],
    [-half * 0.7, nose + length * 0.21],
    [-half * 0.28, nose + length * 0.07],
  ];
}

function wingPoints(side, span, length, taper, profile) {
  const s = side < 0 ? -1 : 1;
  const rootFront = profile === "specter" ? -length * 0.62 : -length * 0.48;
  const tipFront = profile === "lancer" ? length * 0.1 : length * (0.01 + taper * 0.14);
  const tipRear = profile === "specter" ? length * 0.44 : length * (0.46 + taper * 0.06);
  return [
    [s * 5, rootFront],
    [s * span * 0.2, -length * 0.4],
    [s * span, tipFront],
    [s * span * (0.56 + taper * 0.2), tipRear],
    [s * 10, length * 0.28],
  ];
}

function createWing(side, blueprint, materials, parts, profile) {
  const group = new THREE.Group();
  group.name = side < 0 ? "left-wing" : "right-wing";
  const [span, length, taper] = blueprint.wing;
  const s = side < 0 ? -1 : 1;
  const wing = mesh(prismGeometry(wingPoints(side, span, length, taper, profile), profile === "siege" ? 4.6 : 3.4), materials.body, group.name + "-shell", [0, -1, 6]);
  const panel = mesh(prismGeometry([
    [s * 12, -length * 0.27],
    [s * span * 0.72, length * (0.03 + taper * 0.1)],
    [s * span * 0.6, length * (0.13 + taper * 0.1)],
    [s * 15, -length * 0.15],
  ], 0.75), materials.panel, group.name + "-panel", [0, 1.2, 8]);
  const edge = mesh(prismGeometry([
    [s * span * 0.34, -length * 0.29],
    [s * span * 0.92, length * (0.02 + taper * 0.13)],
    [s * span * 0.88, length * (0.05 + taper * 0.13)],
    [s * span * 0.36, -length * 0.24],
  ], 0.48), materials.accent, group.name + "-edge", [0, 1.8, 8]);
  group.add(wing, panel, edge);
  remember(group, { side });
  parts.wings.push(group);
  return group;
}

function addCanards(group, blueprint, materials, parts) {
  if (!blueprint.canard) return;
  for (const side of [-1, 1]) {
    const canard = mesh(
      prismGeometry([[0, -11], [side * blueprint.canard, 2], [side * 5, 12]], 2),
      materials.body,
      side < 0 ? "left-canard" : "right-canard",
      [0, 2, -36],
    );
    remember(canard, { side });
    group.add(canard);
    parts.canards.push(canard);
  }
}

function addTails(group, blueprint, materials, parts, profile) {
  for (let index = 0; index < blueprint.tails; index += 1) {
    const side = blueprint.tails === 1 ? 0 : index === 0 ? -1 : 1;
    const height = profile === "siege" ? 23 : profile === "hypersonic" ? 20 : 18;
    const width = profile === "siege" ? 12 : 9;
    const tail = mesh(
      verticalPlateGeometry([
        [-width * 0.55, 0],
        [width * 0.52, 0],
        [width * 0.3, height],
        [-width * 0.38, height * 0.76],
      ], 4),
      materials.body,
      side < 0 ? "left-tail" : side > 0 ? "right-tail" : "center-tail",
      [side * 15, 3, 49],
      [0.06, 0, side * 0.2],
    );
    const stripe = mesh(
      verticalPlateGeometry([[-1.1, 2], [1.1, 2], [0.8, height * 0.78], [-0.7, height * 0.65]], 4.4),
      materials.accent,
      tail.name + "-mark",
      [0, 0.2, 0],
    );
    tail.add(stripe);
    remember(tail, { side: side || 1 });
    group.add(tail);
    parts.tails.push(tail);
  }
}

function addEngines(group, blueprint, materials, parts) {
  const count = blueprint.engines;
  const spacing = count === 3 ? 15 : count === 1 ? 0 : 18;
  for (let index = 0; index < count; index += 1) {
    const x = (index - (count - 1) / 2) * spacing;
    const nacelle = mesh(new THREE.CylinderGeometry(5.2, 7.4, 31, 16), materials.underside, "engine-" + (index + 1), [x, -4.5, blueprint.body[1] * 0.38], [Math.PI / 2, 0, 0]);
    const rim = mesh(new THREE.TorusGeometry(5.1, 0.75, 7, 24), materials.accent, "engine-rim-" + (index + 1), [x, -4.5, blueprint.body[1] * 0.38 + 15.8]);
    const glow = mesh(new THREE.CircleGeometry(4.3, 22), materials.emissive, "engine-glow-" + (index + 1), [x, -4.5, blueprint.body[1] * 0.38 + 16.1]);
    group.add(nacelle, rim, glow);
    remember(glow, { engineIndex: index });
    parts.engines.push(glow);
  }
}

function addAirframeDetails(group, blueprint, materials) {
  const [bodyWidth, bodyLength] = blueprint.body;
  for (const side of [-1, 1]) {
    const intake = mesh(prismGeometry([
      [side * 3, -13],
      [side * bodyWidth * 0.7, -5],
      [side * bodyWidth * 0.62, 17],
      [side * 4, 8],
    ], 3.2), materials.underside, side < 0 ? "left-intake" : "right-intake", [0, -1.5, -bodyLength * 0.08]);
    const chine = mesh(prismGeometry([
      [side * 1.8, -bodyLength * 0.41],
      [side * bodyWidth * 0.44, -bodyLength * 0.24],
      [side * bodyWidth * 0.38, -bodyLength * 0.2],
      [side * 1.4, -bodyLength * 0.36],
    ], 0.7), materials.panel, side < 0 ? "left-chine" : "right-chine", [0, 6, 0]);
    group.add(intake, chine);
  }
}

function addProfileDetails(group, profile, materials, parts) {
  const addSpecial = (part, kind, side = 0) => {
    remember(part, { kind, side });
    group.add(part);
    parts.special.push(part);
  };
  if (profile === "commander") {
    addSpecial(mesh(prismGeometry([[-1.5, -32], [1.5, -32], [2.2, 38], [-2.2, 38]], 0.9), materials.accent, "dragon-spine", [0, 7, 2]), "dragon-spine");
    for (const side of [-1, 1]) addSpecial(mesh(prismGeometry([[0, -8], [side * 15, 2], [side * 4, 13]], 1.3), materials.panel, "command-crown-" + side, [side * 8, 7, 28]), "command-crown", side);
  } else if (profile === "falcon") {
    for (const side of [-1, 1]) addSpecial(mesh(prismGeometry([[0, -16], [side * 13, -1], [side * 2, 19]], 2), materials.accent, "falcon-blade-" + side, [side * 39, 4, 18]), "falcon-blade", side);
  } else if (profile === "specter") {
    for (const side of [-1, 1]) addSpecial(mesh(prismGeometry([[0, -19], [side * 11, -3], [side * 8, 18], [side * -3, 14]], 4.2), materials.panel, "drone-pod-" + side, [side * 59, 3, 16]), "drone-pod", side);
  } else if (profile === "hunter") {
    for (const side of [-1, 1]) addSpecial(mesh(prismGeometry([[-6, -15], [6, -12], [5, 15], [-5, 15]], 3.4), materials.underside, "weapon-bay-" + side, [side * 24, -3, 15]), "weapon-bay", side);
  } else if (profile === "lancer") {
    addSpecial(mesh(prismGeometry([[-1.5, -60], [1.5, -60], [3.2, 46], [-3.2, 46]], 1.4), materials.accent, "storm-lance", [0, 7, 0]), "storm-lance");
  } else if (profile === "dualist") {
    for (const side of [-1, 1]) addSpecial(mesh(new THREE.TorusGeometry(11, 1.3, 8, 28), side < 0 ? materials.accent : materials.secondary, "resonance-ring-" + side, [side * 34, 5, 16], [Math.PI / 2, 0, 0]), "resonance-ring", side);
  } else if (profile === "skirmisher") {
    addSpecial(mesh(prismGeometry([[-2, -34], [2, -34], [3, 32], [-3, 32]], 2.4), materials.accent, "gryphon-rail", [0, 7, 8]), "gryphon-rail");
  } else if (profile === "siege") {
    for (const side of [-1, 1]) addSpecial(mesh(prismGeometry([[-9, -20], [9, -16], [8, 20], [-8, 20]], 8), materials.panel, "siege-pod-" + side, [side * 33, 4, 18]), "siege-pod", side);
  } else if (profile === "hypersonic") {
    addSpecial(mesh(new THREE.OctahedronGeometry(8.5), materials.emissive, "hyper-core", [0, 12, -10]), "hyper-core");
    const crown = new THREE.Group();
    crown.name = "hyper-crown";
    crown.position.set(0, 4, 29);
    crown.rotation.x = Math.PI / 2;
    crown.add(mesh(new THREE.TorusGeometry(27, 1.1, 8, 48), materials.secondary, "crown-ring"));
    for (let index = 0; index < 5; index += 1) {
      const blade = mesh(new THREE.BoxGeometry(1.8, 16, 1.2), index % 2 ? materials.secondary : materials.accent, "crown-blade-" + index);
      blade.rotation.z = (index - 2) * 0.34;
      blade.position.y = -11;
      crown.add(blade);
    }
    addSpecial(crown, "hyper-crown");
  }
}

export function createFighterModel(fighter) {
  const profile = fighter.rig.profile;
  const blueprint = BLUEPRINTS[profile] || BLUEPRINTS.commander;
  const accent = new THREE.Color(fighter.accent);
  const secondary = new THREE.Color(fighter.secondary);
  const materials = {
    body: material(blueprint.bodyColor, 0.86, 0.23),
    underside: material(blueprint.underside, 0.76, 0.32),
    panel: material(new THREE.Color(blueprint.bodyColor).multiplyScalar(0.72), 0.84, 0.3),
    accent: material(accent, 0.66, 0.22, accent.clone().multiplyScalar(0.2), 0.28),
    secondary: material(secondary, 0.6, 0.28, secondary.clone().multiplyScalar(0.08), 0.14),
    emissive: material(accent, 0.34, 0.16, accent, 2.6),
    canopy: material(0x163f52, 0.28, 0.12, accent.clone().multiplyScalar(0.12), 0.3),
  };
  const root = new THREE.Group();
  root.name = fighter.id;
  const parts = { wings: [], canards: [], tails: [], engines: [], special: [] };
  const [bodyWidth, bodyLength] = blueprint.body;
  const fuselage = mesh(prismGeometry(bodyPoints(bodyWidth, bodyLength, profile), profile === "siege" ? 13 : 10), materials.body, "fuselage");
  const upperDeck = mesh(prismGeometry(bodyPoints(bodyWidth * 0.58, bodyLength * 0.76, profile), 3.8), materials.panel, "upper-deck", [0, 6.2, -5]);
  const lower = mesh(prismGeometry(bodyPoints(bodyWidth * 0.7, bodyLength * 0.82, profile), 4.6), materials.underside, "lower-fuselage", [0, -7, 8]);
  const canopy = mesh(new THREE.SphereGeometry(6, 24, 14), materials.canopy, "canopy", [0, 8.4, -bodyLength * 0.24], [0, 0, Math.PI]);
  canopy.scale.set(profile === "siege" ? 1.05 : 0.76, 0.42, profile === "hypersonic" ? 1.72 : 1.46);
  root.add(fuselage, upperDeck, lower, canopy);
  root.add(createWing(-1, blueprint, materials, parts, profile), createWing(1, blueprint, materials, parts, profile));
  addCanards(root, blueprint, materials, parts);
  addTails(root, blueprint, materials, parts, profile);
  addEngines(root, blueprint, materials, parts);
  addAirframeDetails(root, blueprint, materials);
  addProfileDetails(root, profile, materials, parts);
  root.userData = {
    fighterId: fighter.id,
    profile,
    blueprint,
    motion: MOTIONS[profile] || MOTIONS.commander,
    parts,
    materials,
    previewMode: "flight",
    previewProgress: 0,
    modeChangedAt: 0,
    lastTime: 0,
  };
  return root;
}

function smoothstep(value) {
  const x = Math.max(0, Math.min(1, value));
  return x * x * (3 - 2 * x);
}

function modeTarget(mode) {
  if (mode === "transform") return 0.42;
  if (mode === "tactical") return 0.72;
  if (mode === "assault") return 1;
  return 0;
}

function updateSpecial(part, profile, mode, progress, time, index) {
  resetPart(part);
  const data = part.userData;
  const side = data.side || (index % 2 ? 1 : -1);
  const tacticalPulse = mode === "tactical" ? 1 + Math.sin(time * 6 + index) * 0.09 : 1;
  if (data.kind === "dragon-spine") {
    part.position.y += progress * 9;
    part.scale.z *= 1 + progress * 0.22;
  } else if (data.kind === "command-crown") {
    part.position.x += side * progress * 8;
    part.position.y += progress * 8;
    part.rotation.y += side * progress * 0.7;
  } else if (data.kind === "falcon-blade") {
    part.position.x += side * progress * 13;
    part.position.y += progress * 10;
    part.rotation.y += side * progress * 0.92;
  } else if (data.kind === "drone-pod") {
    part.position.x += side * progress * 20;
    part.position.y += progress * 12;
    part.rotation.z += side * progress * 0.56;
  } else if (data.kind === "weapon-bay") {
    part.position.y += progress * 7;
    part.rotation.x -= progress * 0.82;
  } else if (data.kind === "storm-lance") {
    part.position.z -= progress * 22;
    part.scale.z *= 1 + progress * 0.28;
  } else if (data.kind === "resonance-ring") {
    part.position.x += side * progress * 9;
    part.position.y += progress * 12;
    part.rotation.y += side * time * (0.45 + progress * 0.8);
  } else if (data.kind === "gryphon-rail") {
    part.position.z -= progress * 16;
    part.scale.z *= 1 + progress * 0.36;
  } else if (data.kind === "siege-pod") {
    part.position.x += side * progress * 8;
    part.position.y += progress * 14;
    part.rotation.x += progress * 0.3;
  } else if (data.kind === "hyper-core") {
    part.position.y += progress * 18;
    part.rotation.y += time * (0.7 + progress);
    part.scale.multiplyScalar(1 + progress * 0.34);
  } else if (data.kind === "hyper-crown") {
    part.position.y += progress * 18;
    part.position.z += progress * 6;
    part.rotation.z += time * (mode === "tactical" ? 1.25 : 0.35) * progress;
    part.scale.multiplyScalar(1 + progress * 0.26);
  }
  part.scale.multiplyScalar(tacticalPulse);
  if (profile === "hypersonic" && mode === "assault") part.scale.multiplyScalar(1.08);
}

export function updateFighterModel(group, mode, time, userRotation = 0) {
  if (!group?.userData?.parts) return;
  const data = group.userData;
  const { profile, motion, parts } = data;
  if (data.previewMode !== mode) {
    data.previewMode = mode;
    data.modeChangedAt = time;
  }
  const delta = Math.max(0, Math.min(0.05, time - data.lastTime || 0));
  data.lastTime = time;
  const target = modeTarget(mode);
  const ease = 1 - Math.exp(-delta * (profile === "hypersonic" ? 7.2 : 5.8));
  data.previewProgress += (target - data.previewProgress) * ease;
  const progress = smoothstep(data.previewProgress);
  parts.wings.forEach((part) => {
    resetPart(part);
    const side = part.userData.side;
    part.rotation.z += side * motion.fold * progress;
    part.rotation.y += side * motion.sweep * progress;
    part.rotation.x += (profile === "siege" ? -0.16 : 0.08) * progress;
    part.position.x += side * motion.outward * progress;
    part.position.y += motion.lift * progress;
  });
  parts.canards.forEach((part) => {
    resetPart(part);
    part.rotation.y += part.userData.side * motion.canard * progress;
    part.rotation.z += part.userData.side * progress * 0.16;
    part.position.y += progress * (profile === "hypersonic" ? 11 : 6);
  });
  parts.tails.forEach((part) => {
    resetPart(part);
    part.rotation.x += progress * (profile === "skirmisher" ? 0.72 : 0.34);
    part.rotation.z += part.userData.side * motion.tail * progress;
    part.position.y += motion.tailLift * progress;
  });
  parts.special.forEach((part, index) => updateSpecial(part, profile, mode, progress, time, index));
  parts.engines.forEach((part, index) => {
    resetPart(part);
    const glow = 1 + Math.sin(time * 11 + index) * 0.08 + progress * (profile === "hypersonic" ? 0.46 : 0.22);
    part.scale.multiplyScalar(glow);
  });
  const transition = Math.max(0, 1 - (time - data.modeChangedAt) / 0.65);
  group.rotation.x = 0.48 + Math.sin(transition * Math.PI) * (profile === "hypersonic" ? 0.12 : 0.06);
  group.rotation.y = userRotation + time * (profile === "hypersonic" ? 0.14 : 0.07);
  group.rotation.z = Math.sin(time * 0.7) * 0.016 + Math.sin(transition * Math.PI * 2) * 0.035;
}
