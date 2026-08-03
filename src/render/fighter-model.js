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

const AERIAL_FORMS = {
  commander: { wingFold: 0.34, wingSweep: 0.22, wingLift: 6, wingOut: 5, coreGap: 3, pitch: 0.4, yaw: 0.06 },
  falcon: { wingFold: 0.68, wingSweep: -0.28, wingLift: 8, wingOut: 9, coreGap: 2, pitch: 0.47, yaw: -0.08 },
  specter: { wingFold: -0.2, wingSweep: 0.54, wingLift: 3, wingOut: 15, coreGap: 4, pitch: 0.36, yaw: 0.1 },
  hunter: { wingFold: 0.26, wingSweep: 0.18, wingLift: 5, wingOut: 6, coreGap: 3, pitch: 0.41, yaw: -0.05 },
  lancer: { wingFold: 0.48, wingSweep: 0.72, wingLift: 7, wingOut: 2, coreGap: 4, pitch: 0.34, yaw: 0.07 },
  dualist: { wingFold: -0.42, wingSweep: -0.5, wingLift: 9, wingOut: 12, coreGap: 3, pitch: 0.48, yaw: -0.11 },
  skirmisher: { wingFold: 0.86, wingSweep: 0.05, wingLift: 10, wingOut: 13, coreGap: 2, pitch: 0.39, yaw: 0.13 },
  siege: { wingFold: 0.05, wingSweep: 0.3, wingLift: 6, wingOut: 11, coreGap: 5, pitch: 0.52, yaw: -0.04 },
  hypersonic: { wingFold: 0.56, wingSweep: 0.82, wingLift: 11, wingOut: 14, coreGap: 3, pitch: 0.32, yaw: 0.12 },
};

const FLIGHT_MECH_FORMS = {
  commander: { archetype: "dragon-vanguard", silhouette: "long-dragon-v", transformStyle: "spine-uncoil", chestWidth: 23, chestDepth: 30, coreStyle: "diamond", armOut: 12, armBack: -7, armLength: 25, armSweep: 0.28, headWidth: 9, headCrest: 8, boosterSpread: 7, boosterDrop: 3, armShape: "claw" },
  falcon: { archetype: "carrier-aegis", silhouette: "shield-trapezoid", transformStyle: "shield-lock", chestWidth: 36, chestDepth: 20, coreStyle: "shield", armOut: 9, armBack: 8, armLength: 18, armSweep: 0.44, headWidth: 12, headCrest: 3, boosterSpread: 11, boosterDrop: 5, armShape: "shield" },
  specter: { archetype: "manta-wraith", silhouette: "flat-manta-crescent", transformStyle: "manta-bloom", chestWidth: 43, chestDepth: 13, coreStyle: "orb", armOut: 20, armBack: 17, armLength: 15, armSweep: -0.28, headWidth: 7, headCrest: 0, boosterSpread: 16, boosterDrop: 1, armShape: "fin" },
  hunter: { archetype: "raptor-interceptor", silhouette: "narrow-raptor-arrow", transformStyle: "talon-snap", chestWidth: 26, chestDepth: 24, coreStyle: "v-core", armOut: 13, armBack: -1, armLength: 24, armSweep: 0.15, headWidth: 8, headCrest: 6, boosterSpread: 9, boosterDrop: 4, armShape: "talon" },
  lancer: { archetype: "storm-piercer", silhouette: "central-spear-triangle", transformStyle: "lance-draw", chestWidth: 19, chestDepth: 36, coreStyle: "lance", armOut: 7, armBack: -23, armLength: 29, armSweep: 0.58, headWidth: 7, headCrest: 13, boosterSpread: 5, boosterDrop: 2, armShape: "lance" },
  dualist: { archetype: "crossblade-duelist", silhouette: "asymmetric-cross-blades", transformStyle: "cross-scissor", chestWidth: 28, chestDepth: 24, coreStyle: "twin", armOut: 16, armBack: 7, armLength: 23, armSweep: -0.52, headWidth: 8, headCrest: 5, boosterSpread: 9, boosterDrop: 3, asymmetric: true, armShape: "blade" },
  skirmisher: { archetype: "vector-dart", silhouette: "compact-single-dart", transformStyle: "vector-kick", chestWidth: 18, chestDepth: 22, coreStyle: "sensor", armOut: 12, armBack: -14, armLength: 27, armSweep: 0.1, headWidth: 6, headCrest: 7, boosterSpread: 0, boosterDrop: 6, asymmetric: true, armShape: "rail" },
  siege: { archetype: "flying-bastion", silhouette: "broad-square-fortress", transformStyle: "armor-deploy", chestWidth: 43, chestDepth: 28, coreStyle: "twin-reactor", armOut: 19, armBack: 14, armLength: 20, armSweep: 0.05, headWidth: 13, headCrest: 2, boosterSpread: 14, boosterDrop: 7, heavy: true, armShape: "battery" },
  hypersonic: { archetype: "trident-seraph", silhouette: "three-pronged-spear", transformStyle: "trident-converge", chestWidth: 22, chestDepth: 38, coreStyle: "white-diamond", armOut: 8, armBack: -17, armLength: 26, armSweep: 0.68, headWidth: 7, headCrest: 9, boosterSpread: 8, boosterDrop: 2, armShape: "swept-fin", trident: true },
};

const TRANSFORM_SEQUENCES = {
  commander: { chassis: [0, 0.24], torso: [0.1, 0.38], engine: [0.3, 0.62], wing: [0.18, 0.58], weapon: [0.44, 0.76], energy: [0.68, 0.88] },
  falcon: { chassis: [0, 0.2], torso: [0.22, 0.48], engine: [0.18, 0.5], wing: [0.08, 0.42], weapon: [0.48, 0.78], energy: [0.72, 0.9] },
  specter: { chassis: [0.05, 0.3], torso: [0.18, 0.42], engine: [0.36, 0.66], wing: [0, 0.5], weapon: [0.28, 0.62], energy: [0.62, 0.86] },
  hunter: { chassis: [0, 0.18], torso: [0.12, 0.36], engine: [0.22, 0.5], wing: [0.3, 0.56], weapon: [0.5, 0.7], energy: [0.66, 0.84] },
  lancer: { chassis: [0, 0.25], torso: [0.12, 0.4], engine: [0.3, 0.58], wing: [0.18, 0.5], weapon: [0.34, 0.76], energy: [0.72, 0.9] },
  dualist: { chassis: [0, 0.22], torso: [0.2, 0.45], engine: [0.28, 0.6], wing: [0.12, 0.56], weapon: [0.42, 0.78], energy: [0.7, 0.9] },
  skirmisher: { chassis: [0, 0.16], torso: [0.08, 0.3], engine: [0.12, 0.4], wing: [0.24, 0.48], weapon: [0.38, 0.62], energy: [0.58, 0.78] },
  siege: { chassis: [0, 0.34], torso: [0.2, 0.52], engine: [0.3, 0.68], wing: [0.12, 0.58], weapon: [0.52, 0.82], energy: [0.76, 0.92] },
  hypersonic: { chassis: [0, 0.14], torso: [0.08, 0.28], engine: [0.18, 0.4], wing: [0.14, 0.42], weapon: [0.32, 0.58], energy: [0.54, 0.76] },
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

function armorGeometry(width, height, depth, bevel = 1.25) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -height / 2);
  shape.lineTo(width / 2, -height / 2);
  shape.lineTo(width / 2, height / 2);
  shape.lineTo(-width / 2, height / 2);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: Math.min(bevel, width * 0.12, height * 0.12),
    bevelThickness: Math.min(bevel, depth * 0.18),
    curveSegments: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
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
    const pod = new THREE.Group();
    pod.name = "engine-pod-" + (index + 1);
    pod.position.set(x, -4.5, blueprint.body[1] * 0.38);
    const nacelle = mesh(new THREE.CylinderGeometry(5.2, 7.4, 31, 16), materials.underside, "engine-" + (index + 1), [0, 0, 0], [Math.PI / 2, 0, 0]);
    const band = mesh(new THREE.TorusGeometry(6.15, 0.65, 6, 20), materials.panel, "engine-band-" + (index + 1), [0, 0, 5.5]);
    const rim = mesh(new THREE.TorusGeometry(5.1, 0.75, 7, 24), materials.accent, "engine-rim-" + (index + 1), [0, 0, 15.8]);
    const glow = mesh(new THREE.CircleGeometry(4.3, 22), materials.emissive, "engine-glow-" + (index + 1), [0, 0, 16.1]);
    pod.add(nacelle, band, rim, glow);
    remember(pod, { engineIndex: index, engineCount: count });
    group.add(pod);
    parts.enginePods.push(pod);
    remember(glow, { engineIndex: index });
    parts.engines.push(glow);
  }
}

function addAirframeDetails(group, blueprint, materials, parts) {
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
    remember(intake, { coreKind: "intake", side });
    remember(chine, { coreKind: "chine", side });
    parts.core.push(intake, chine);
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
    for (const side of [-1, 1]) addSpecial(mesh(prismGeometry([[0, -18], [side * 8, -2], [side * 3, 20]], 1.8), side < 0 ? materials.accent : materials.secondary, "cross-blade-" + side, [side * 32, 5, 15]), "cross-blade", side);
  } else if (profile === "skirmisher") {
    addSpecial(mesh(prismGeometry([[-2, -34], [2, -34], [3, 32], [-3, 32]], 2.4), materials.accent, "gryphon-rail", [0, 7, 8]), "gryphon-rail");
  } else if (profile === "siege") {
    for (const side of [-1, 1]) addSpecial(mesh(prismGeometry([[-9, -20], [9, -16], [8, 20], [-8, 20]], 8), materials.panel, "siege-pod-" + side, [side * 33, 4, 18]), "siege-pod", side);
  } else if (profile === "hypersonic") {
    for (const side of [-1, 1]) addSpecial(mesh(prismGeometry([[0, -34], [side * 5, -6], [side * 3, 34]], 1.2), materials.accent, "trident-rail-" + side, [side * 12, 6, 8]), "trident-rail", side);
  }
}

function addFlightMechCore(chest, mech, materials) {
  const y = 10;
  if (mech.coreStyle === "diamond") {
    chest.add(mesh(new THREE.OctahedronGeometry(6), materials.emissive, "flight-mech-diamond-core", [0, y, -1], [0, 0, Math.PI / 4]));
  } else if (mech.coreStyle === "shield") {
    chest.add(
      mesh(new THREE.CylinderGeometry(8, 10, 2.8, 6), materials.accent, "flight-mech-shield-core", [0, y, -1], [Math.PI / 2, 0, 0]),
      mesh(armorGeometry(8, 1.5, 5, 0.4), materials.emissive, "flight-mech-shield-slit", [0, y + 2, -5]),
    );
  } else if (mech.coreStyle === "orb") {
    chest.add(mesh(new THREE.SphereGeometry(6.5, 18, 12), materials.emissive, "flight-mech-orb-core", [0, y, -1]));
  } else if (mech.coreStyle === "v-core") {
    for (const side of [-1, 1]) chest.add(mesh(armorGeometry(3.5, 2, 15, 0.5), materials.emissive, `flight-mech-v-core-${side}`, [side * 4, y, -1], [0, side * 0.52, 0]));
  } else if (mech.coreStyle === "lance") {
    chest.add(mesh(new THREE.ConeGeometry(4.5, 18, 5), materials.emissive, "flight-mech-lance-core", [0, y, -5], [Math.PI / 2, 0, 0]));
  } else if (mech.coreStyle === "twin") {
    for (const side of [-1, 1]) chest.add(mesh(new THREE.OctahedronGeometry(4.5), side < 0 ? materials.accent : materials.secondary, `flight-mech-twin-core-${side}`, [side * 7, y, -1]));
  } else if (mech.coreStyle === "sensor") {
    chest.add(mesh(armorGeometry(11, 1.5, 4, 0.4), materials.emissive, "flight-mech-sensor-core", [0, y, -5]));
  } else if (mech.coreStyle === "twin-reactor") {
    for (const side of [-1, 1]) chest.add(mesh(new THREE.CylinderGeometry(5.5, 5.5, 3, 12), materials.emissive, `flight-mech-reactor-${side}`, [side * 9, y, -1], [Math.PI / 2, 0, 0]));
  } else if (mech.coreStyle === "white-diamond") {
    const core = mesh(new THREE.OctahedronGeometry(5.2), materials.emissive, "flight-mech-white-diamond-core", [0, y, -2], [0, 0, Math.PI / 4]);
    core.scale.set(0.72, 1.2, 0.5);
    chest.add(core);
  }
}

function createTransformationHardware(root, blueprint, materials, parts, profile) {
  const mech = FLIGHT_MECH_FORMS[profile] || FLIGHT_MECH_FORMS.commander;

  const chest = new THREE.Group();
  chest.name = `flight-mech-chest-${mech.archetype}`;
  chest.position.set(0, 7, -7);
  chest.add(
    mesh(armorGeometry(mech.chestWidth, mech.heavy ? 8 : 5.5, mech.chestDepth, 1.1), materials.underside, "flight-mech-chest-shell"),
    mesh(prismGeometry([
      [-mech.chestWidth * 0.42, -mech.chestDepth * 0.34],
      [0, -mech.chestDepth * 0.56],
      [mech.chestWidth * 0.42, -mech.chestDepth * 0.34],
      [mech.chestWidth * 0.34, mech.chestDepth * 0.32],
      [0, mech.chestDepth * 0.48],
      [-mech.chestWidth * 0.34, mech.chestDepth * 0.32],
    ], 2.2), materials.body, "flight-mech-breastplate", [0, 4, -1]),
  );
  addFlightMechCore(chest, mech, materials);
  remember(chest, { aerialKind: "chest" });
  root.add(chest);
  parts.aerial.push(chest);

  const head = new THREE.Group();
  head.name = `flight-mech-head-${mech.archetype}`;
  head.position.set(0, 9, -blueprint.body[1] * 0.25);
  const headShell = profile === "specter"
    ? new THREE.SphereGeometry(mech.headWidth * 0.58, 14, 9)
    : profile === "lancer"
      ? new THREE.ConeGeometry(mech.headWidth * 0.52, 18, 5)
      : armorGeometry(mech.headWidth, mech.heavy ? 7 : 5.5, mech.heavy ? 14 : 11, 0.9);
  const headRotation = profile === "lancer" ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  head.add(mesh(headShell, materials.body, "flight-mech-helmet", [0, 0, 0], headRotation));
  head.add(mesh(armorGeometry(mech.headWidth * (profile === "siege" ? 0.75 : 0.58), 1.1, profile === "skirmisher" ? 10 : 7, 0.3), materials.emissive, "flight-mech-visor", [0, mech.heavy ? 4.2 : 3.4, -2]));
  if (mech.headCrest > 0) head.add(mesh(new THREE.ConeGeometry(mech.heavy ? 1.3 : 0.8, mech.headCrest, 4), materials.panel, "flight-mech-crest", [0, 3.8, -4], [Math.PI / 2, 0, 0]));
  remember(head, { aerialKind: "head" });
  root.add(head);
  parts.aerial.push(head);

  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.name = `flight-mech-${side < 0 ? "left" : "right"}-arm-${mech.archetype}`;
    arm.position.set(side * (mech.chestWidth * 0.34), 5, 0);
    const localLength = mech.armLength * (mech.asymmetric && side > 0 ? 1.28 : 1);
    const armWidth = mech.heavy ? 10 : profile === "specter" ? 5 : 7;
    const armShell = prismGeometry([
      [0, -localLength * 0.48],
      [side * armWidth, -localLength * 0.22],
      [side * armWidth * 0.72, localLength * 0.48],
      [0, localLength * 0.34],
    ], mech.heavy ? 6 : 3.4);
    arm.add(mesh(armShell, materials.panel, `${arm.name}-body`, [side * 2, 0, localLength * 0.42]));
    if (profile === "commander") {
      arm.add(mesh(prismGeometry([[0, -11], [side * 7, 0], [side * 2, 15]], 1.7), materials.accent, `${arm.name}-dragon-talon`, [side * 4, 2, localLength * 0.9]));
    } else if (profile === "falcon") {
      arm.add(mesh(prismGeometry([[0, -13], [side * 13, -5], [side * 11, 12], [0, 16]], 3.2), materials.body, `${arm.name}-shield`, [side * 3, 3, localLength * 0.42]));
    } else if (profile === "specter") {
      arm.add(mesh(prismGeometry([[0, -15], [side * 12, 2], [side * 2, 13]], 1.2), materials.accent, `${arm.name}-manta-fin`, [side * 4, 1, localLength * 0.6]));
    } else if (profile === "hunter") {
      arm.add(mesh(prismGeometry([[0, -16], [side * 8, -4], [side * 4, 18]], 2), materials.accent, `${arm.name}-raptor-blade`, [side * 10, 4, localLength * 0.76]));
    } else if (profile === "lancer") {
      arm.add(mesh(new THREE.ConeGeometry(side < 0 ? 3.2 : 2.1, side < 0 ? 28 : 16, 6), materials.emissive, `${arm.name}-storm-lance`, [side * 9, 1, localLength * 1.42], [Math.PI / 2, 0, 0]));
    } else if (profile === "dualist") {
      arm.add(mesh(prismGeometry([[0, -15], [side * 9, 0], [side * 3, 18]], 2.4), side < 0 ? materials.accent : materials.secondary, `${arm.name}-duel-blade`, [side * 10, 4, localLength * 0.8]));
    } else if (profile === "skirmisher") {
      arm.add(mesh(new THREE.CylinderGeometry(side > 0 ? 2.2 : 1.2, side > 0 ? 3 : 1.8, side > 0 ? 32 : 14, 8), materials.accent, `${arm.name}-railgun`, [side * 6, 1, localLength * 1.1], [Math.PI / 2, 0, 0]));
    } else if (profile === "siege") {
      for (const offset of [-3.2, 3.2]) arm.add(mesh(new THREE.CylinderGeometry(2.6, 3.4, 24, 10), materials.underside, `${arm.name}-siege-barrel-${offset}`, [side * 9 + offset, 1, localLength * 1.22], [Math.PI / 2, 0, 0]));
    } else if (profile === "hypersonic") {
      arm.add(mesh(prismGeometry([[0, -24], [side * 8, -3], [side * 2, 25]], 1.4), materials.accent, `${arm.name}-trident-fin`, [side * 3, 2, localLength * 0.58]));
    }
    remember(arm, { aerialKind: "arm", side });
    root.add(arm);
    parts.aerial.push(arm);
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
  const parts = { core: [], wings: [], canards: [], tails: [], enginePods: [], engines: [], special: [], aerial: [], aerialDetails: [] };
  const [bodyWidth, bodyLength] = blueprint.body;
  const fuselage = mesh(prismGeometry(bodyPoints(bodyWidth, bodyLength, profile), profile === "siege" ? 13 : 10), materials.body, "fuselage");
  const upperDeck = mesh(prismGeometry(bodyPoints(bodyWidth * 0.58, bodyLength * 0.76, profile), 3.8), materials.panel, "upper-deck", [0, 6.2, -5]);
  const lower = mesh(prismGeometry(bodyPoints(bodyWidth * 0.7, bodyLength * 0.82, profile), 4.6), materials.underside, "lower-fuselage", [0, -7, 8]);
  const canopy = mesh(new THREE.SphereGeometry(6, 24, 14), materials.canopy, "canopy", [0, 8.4, -bodyLength * 0.24], [0, 0, Math.PI]);
  canopy.scale.set(profile === "siege" ? 1.05 : 0.76, 0.42, profile === "hypersonic" ? 1.72 : 1.46);
  [fuselage, upperDeck, lower, canopy].forEach((part) => {
    remember(part, { coreKind: part.name });
    parts.core.push(part);
  });
  root.add(fuselage, upperDeck, lower, canopy);
  root.add(createWing(-1, blueprint, materials, parts, profile), createWing(1, blueprint, materials, parts, profile));
  addCanards(root, blueprint, materials, parts);
  addTails(root, blueprint, materials, parts, profile);
  addEngines(root, blueprint, materials, parts);
  addAirframeDetails(root, blueprint, materials, parts);
  addProfileDetails(root, profile, materials, parts);
  createTransformationHardware(root, blueprint, materials, parts, profile);
  root.userData = {
    fighterId: fighter.id,
    profile,
    blueprint,
    motion: MOTIONS[profile] || MOTIONS.commander,
    form: AERIAL_FORMS[profile] || AERIAL_FORMS.commander,
    mechForm: FLIGHT_MECH_FORMS[profile] || FLIGHT_MECH_FORMS.commander,
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
  return mode === "flight" ? 0 : 1;
}

function phase(value, start, end) {
  return smoothstep((value - start) / Math.max(0.001, end - start));
}

function lockBounce(value) {
  const x = Math.max(0, Math.min(1, value));
  return 1 + Math.sin(x * Math.PI * 2.5) * (1 - x) * 0.16;
}

function updateSpecial(part, profile, mode, progress, time, index) {
  resetPart(part);
  const data = part.userData;
  const side = data.side || (index % 2 ? 1 : -1);
  const tacticalPulse = mode === "tactical" ? 1 + Math.sin(time * 6 + index) * 0.09 : 1;
  if (data.kind === "dragon-spine") {
    part.position.y += progress * 22;
    part.position.z += progress * 42;
    part.rotation.x += progress * 0.82;
    part.scale.z *= 1 - progress * 0.76;
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
  } else if (data.kind === "cross-blade") {
    part.position.x += side * progress * 7;
    part.position.y += progress * 8;
    part.rotation.y += side * progress * 0.72;
    part.rotation.z += side * progress * 0.42;
  } else if (data.kind === "gryphon-rail") {
    part.position.z -= progress * 16;
    part.scale.z *= 1 + progress * 0.36;
  } else if (data.kind === "siege-pod") {
    part.position.x += side * progress * 8;
    part.position.y += progress * 14;
    part.rotation.x += progress * 0.3;
  } else if (data.kind === "trident-rail") {
    part.position.x -= side * progress * 5;
    part.position.z -= progress * 12;
    part.rotation.y += side * progress * 0.18;
  }
  part.scale.multiplyScalar(tacticalPulse);
  if (profile === "hypersonic" && mode === "assault") part.scale.multiplyScalar(1.08);
}

export function updateFighterModel(group, mode, time, userRotation = 0, reducedMotion = false, lowQuality = false) {
  if (!group?.userData?.parts) return;
  const data = group.userData;
  const { profile, motion, form, mechForm, parts } = data;
  if (data.previewMode !== mode) {
    data.previewMode = mode;
    data.modeChangedAt = time;
  }
  const delta = Math.max(0, Math.min(0.05, time - data.lastTime || 0));
  data.lastTime = time;
  const target = modeTarget(mode);
  const ease = reducedMotion ? 1 : 1 - Math.exp(-delta * (profile === "hypersonic" ? 5.8 : 4.6));
  data.previewProgress += (target - data.previewProgress) * ease;
  const progress = smoothstep(data.previewProgress);
  const sequence = TRANSFORM_SEQUENCES[profile] || TRANSFORM_SEQUENCES.commander;
  const chassisPhase = phase(progress, ...sequence.chassis);
  const torsoPhase = phase(progress, ...sequence.torso);
  const enginePhase = phase(progress, ...sequence.engine);
  const wingPhase = phase(progress, ...sequence.wing);
  const weaponPhase = phase(progress, ...sequence.weapon);
  const energyPhase = phase(progress, ...sequence.energy);
  const lockPhase = phase(progress, 0.82, 1);
  const bounce = reducedMotion ? 1 : lockBounce(lockPhase);

  parts.core.forEach((part) => {
    resetPart(part);
    if (part.userData.coreKind === "fuselage") {
      part.position.y += chassisPhase * form.coreGap;
      part.scale.z *= 1 - chassisPhase * 0.1;
      part.scale.x *= 1 + torsoPhase * 0.08;
      part.scale.y *= 1 + torsoPhase * 0.14;
    } else if (part.userData.coreKind === "upper-deck") {
      part.position.y += chassisPhase * (form.coreGap + 5);
      part.position.z -= chassisPhase * 5;
      part.scale.z *= 1 - chassisPhase * 0.12;
      part.rotation.x -= chassisPhase * 0.12;
    } else if (part.userData.coreKind === "lower-fuselage") {
      part.position.y -= enginePhase * (form.coreGap + 3);
      part.position.z += enginePhase * 4;
      part.scale.x *= 1 + enginePhase * 0.12;
      part.rotation.x += enginePhase * 0.1;
    } else if (part.userData.coreKind === "canopy") {
      part.position.y += torsoPhase * 7;
      part.position.z -= torsoPhase * 4;
      part.scale.multiplyScalar(1 + torsoPhase * 0.08);
    } else if (part.userData.coreKind === "intake") {
      part.position.x += part.userData.side * torsoPhase * (5 + form.coreGap * 0.4);
      part.position.y -= torsoPhase * 4;
      part.rotation.z += part.userData.side * torsoPhase * 0.18;
    } else if (part.userData.coreKind === "chine") {
      part.position.x += part.userData.side * weaponPhase * 7;
      part.position.y += weaponPhase * 5;
      part.rotation.y += part.userData.side * weaponPhase * 0.34;
    }
  });
  parts.wings.forEach((part) => {
    resetPart(part);
    const side = part.userData.side;
    part.rotation.z += side * form.wingFold * wingPhase;
    part.rotation.y += side * form.wingSweep * wingPhase;
    part.rotation.x += (profile === "specter" ? -0.18 : profile === "siege" ? 0.08 : 0.16) * wingPhase;
    part.position.x += side * form.wingOut * wingPhase;
    part.position.y += form.wingLift * wingPhase;
    part.position.z += (profile === "lancer" ? -12 : profile === "dualist" ? side * 7 : 5) * wingPhase;
    if (mechForm.transformStyle === "shield-lock") part.rotation.x += Math.sin(wingPhase * Math.PI) * 0.28;
    if (mechForm.transformStyle === "manta-bloom") part.scale.x *= 1 + wingPhase * 0.12;
    if (mechForm.transformStyle === "talon-snap") part.rotation.z += side * Math.sin(wingPhase * Math.PI) * 0.22;
    if (mechForm.transformStyle === "cross-scissor") part.position.z += side * wingPhase * 9;
    if (mechForm.transformStyle === "armor-deploy") part.scale.y *= 1 + wingPhase * 0.16;
    if (mechForm.transformStyle === "trident-converge") part.position.x -= side * wingPhase * 6;
  });
  parts.canards.forEach((part) => {
    resetPart(part);
    const side = part.userData.side;
    part.rotation.y += side * motion.canard * weaponPhase;
    part.rotation.z += side * weaponPhase * (profile === "lancer" ? 0.56 : 0.24);
    part.position.x += side * weaponPhase * (profile === "hypersonic" ? 14 : 8);
    part.position.y += weaponPhase * (profile === "hypersonic" ? 9 : 5);
    part.position.z -= weaponPhase * (profile === "lancer" ? 14 : 5);
  });
  parts.tails.forEach((part) => {
    resetPart(part);
    part.rotation.x += wingPhase * (profile === "skirmisher" ? 0.72 : 0.28);
    part.rotation.z += part.userData.side * motion.tail * progress;
    part.position.x += part.userData.side * wingPhase * (profile === "siege" ? 14 : 7);
    part.position.y += motion.tailLift * progress * 0.55;
    part.position.z += wingPhase * (profile === "hunter" ? -5 : 7);
  });
  parts.special.forEach((part, index) => updateSpecial(part, profile, mode, progress, time, index));
  parts.aerialDetails.forEach((part) => {
    part.visible = !lowQuality;
  });
  parts.aerial.forEach((part) => {
    resetPart(part);
    const kind = part.userData.aerialKind;
    const side = part.userData.side || 0;
    const reveal = kind === "chest" ? torsoPhase : kind === "head" ? energyPhase : kind === "ring" ? energyPhase : weaponPhase;
    const scale = Math.max(0.001, reveal) * (kind === "chest" || kind === "head" ? bounce : 1);
    part.scale.multiplyScalar(scale);
    if (kind === "chest") {
      part.position.y += torsoPhase * (profile === "hypersonic" ? 12 : 7);
      part.position.z += (1 - torsoPhase) * 18;
      part.rotation.x += (1 - torsoPhase) * -0.6;
    } else if (kind === "head") {
      part.position.y += energyPhase * 8;
      part.position.z += (1 - energyPhase) * 20;
      part.rotation.x += (1 - energyPhase) * -1.1;
    } else if (kind === "arm") {
      const asymmetry = mechForm.asymmetric && side > 0 ? 1.18 : 1;
      part.position.x += side * weaponPhase * mechForm.armOut * asymmetry;
      part.position.y += weaponPhase * (profile === "falcon" ? -2 : profile === "specter" ? 1 : 3);
      part.position.z += weaponPhase * mechForm.armBack * (mechForm.asymmetric && side > 0 ? -0.45 : 1);
      part.rotation.y += side * weaponPhase * mechForm.armSweep;
      part.rotation.z += side * weaponPhase * (profile === "falcon" ? 0.42 : profile === "specter" ? -0.3 : profile === "hypersonic" ? -0.2 : 0.16);
      if (mechForm.transformStyle === "spine-uncoil") part.rotation.x -= weaponPhase * 0.18;
      if (mechForm.transformStyle === "shield-lock") part.rotation.y -= side * Math.sin(weaponPhase * Math.PI) * 0.36;
      if (mechForm.transformStyle === "manta-bloom") part.position.x += side * weaponPhase * 5;
      if (mechForm.transformStyle === "talon-snap") part.rotation.z += side * Math.sin(weaponPhase * Math.PI) * 0.3;
      if (mechForm.transformStyle === "lance-draw") part.position.z -= weaponPhase * (side < 0 ? 10 : 3);
      if (mechForm.transformStyle === "cross-scissor") part.rotation.y += side * weaponPhase * 0.5;
      if (mechForm.transformStyle === "vector-kick") part.rotation.x -= weaponPhase * (side > 0 ? 0.38 : 0.08);
      if (mechForm.transformStyle === "armor-deploy") part.position.y -= weaponPhase * 3;
      if (mechForm.transformStyle === "trident-converge") part.position.x -= side * weaponPhase * 5;
      part.rotation.x += mode === "assault" ? -0.18 * lockPhase : mode === "tactical" ? 0.12 * lockPhase : 0;
    } else if (kind === "ring") {
      part.position.z += energyPhase * (profile === "hypersonic" ? -26 : -12);
      part.rotation.z += reducedMotion ? 0 : time * (profile === "dualist" ? -0.9 : 0.7) * energyPhase;
    } else if (kind === "details") {
      part.position.y += weaponPhase * 5;
      part.position.z += weaponPhase * (profile === "lancer" ? -10 : 7);
      part.rotation.y += form.yaw * weaponPhase * 1.8;
      if (!reducedMotion) part.rotation.z += Math.sin(time * 1.4) * 0.018 * energyPhase;
    }
  });
  parts.enginePods.forEach((part) => {
    resetPart(part);
    const index = part.userData.engineIndex;
    const count = part.userData.engineCount;
    const centerEngine = count === 1 || (count === 3 && index === 1);
    if (centerEngine) {
      part.position.y -= enginePhase * mechForm.boosterDrop;
      part.position.z += enginePhase * (profile === "hypersonic" ? 10 : 8);
      part.rotation.x -= enginePhase * (profile === "skirmisher" ? 0.28 : 0.1);
      part.scale.multiplyScalar(1 + enginePhase * 0.12);
    } else {
      const side = index < count / 2 ? -1 : 1;
      const connectedX = side * mechForm.boosterSpread;
      part.position.x += (connectedX - part.userData.basePosition.x) * enginePhase;
      part.position.y -= enginePhase * mechForm.boosterDrop;
      part.position.z += enginePhase * (profile === "siege" ? 12 : profile === "hypersonic" ? 9 : 8);
      part.rotation.y += side * enginePhase * (profile === "hunter" ? 0.52 : 0.24);
      part.rotation.z += side * enginePhase * (profile === "falcon" ? 0.48 : profile === "siege" ? 0.08 : 0.18);
      part.scale.multiplyScalar(1 + enginePhase * 0.14);
    }
    if (mechForm.transformStyle === "manta-bloom") part.position.y += enginePhase * 3;
    if (mechForm.transformStyle === "armor-deploy") part.scale.x *= 1 + enginePhase * 0.14;
  });
  parts.engines.forEach((part, index) => {
    resetPart(part);
    const glow = 1 + Math.sin(time * 11 + index) * 0.08 + progress * (profile === "hypersonic" ? 0.46 : 0.22);
    part.scale.multiplyScalar(glow);
  });
  const transition = Math.max(0, 1 - (time - data.modeChangedAt) / (reducedMotion ? 0.01 : 1.35));
  const mechanicalKick = reducedMotion ? 0 : Math.sin(transition * Math.PI * 5) * transition;
  const idleYaw = time * (profile === "hypersonic" ? 0.11 : 0.055);
  group.rotation.x = 0.48 + (form.pitch - 0.48) * progress + Math.sin(transition * Math.PI) * (profile === "hypersonic" ? 0.12 : 0.07);
  group.rotation.y = userRotation + idleYaw + form.yaw * progress + mechanicalKick * 0.025;
  group.rotation.z = (reducedMotion ? 0 : Math.sin(time * 0.7) * 0.012) + mechanicalKick * 0.035 + (profile === "dualist" ? 0.04 * progress : 0);
  group.position.y = lockPhase * 4 + mechanicalKick * 1.5;
  data.transformPhase = { chassisPhase, torsoPhase, enginePhase, wingPhase, weaponPhase, energyPhase, lockPhase };
}
