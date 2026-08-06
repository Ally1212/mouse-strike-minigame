import * as THREE from "three-platformize";

function colorValue(value) {
  if (value instanceof THREE.Color) return value;
  const style = typeof value === "string" && value.startsWith("rgba(")
    ? `rgb(${value.slice(5).split(",").slice(0, 3).join(",")})`
    : value;
  return new THREE.Color(style);
}

function createTextTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.LinearEncoding;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function polygonTopologyKey(vertices) {
  const turns = vertices.map((current, index) => {
    const previous = vertices[(index - 1 + vertices.length) % vertices.length];
    const next = vertices[(index + 1) % vertices.length];
    const cross = (current.x - previous.x) * (next.y - current.y)
      - (current.y - previous.y) * (next.x - current.x);
    return Math.sign(cross);
  });
  return `${vertices.length}:${turns.join(",")}`;
}

export class ImmediateLayer {
  constructor(runtime) {
    this.runtime = runtime;
    this.group = new THREE.Group();
    this.rects = [];
    this.circles = [];
    this.lines = [];
    this.polygons = [];
    this.texts = [];
    this.rectIndex = 0;
    this.circleIndex = 0;
    this.lineIndex = 0;
    this.polygonIndex = 0;
    this.textIndex = 0;
    this.plane = new THREE.PlaneGeometry(1, 1);
    this.disc = new THREE.CircleGeometry(1, 24);
  }

  sceneY(y) {
    return this.runtime.viewport.height - y;
  }

  begin() {
    this.rectIndex = 0;
    this.circleIndex = 0;
    this.lineIndex = 0;
    this.polygonIndex = 0;
    this.textIndex = 0;
  }

  polygon({ points, color = "#ffffff", opacity = 1, border = null, z = 0 }) {
    if (!Array.isArray(points) || points.length < 3) return null;
    let slot = this.polygons[this.polygonIndex];
    if (!slot) {
      const body = new THREE.Mesh(
        new THREE.BufferGeometry(),
        new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
      );
      const outline = new THREE.LineLoop(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ transparent: true, depthTest: false, depthWrite: false }),
      );
      body.frustumCulled = false;
      outline.frustumCulled = false;
      body.add(outline);
      this.group.add(body);
      slot = { body, outline, vertexCount: 0, topologyKey: "" };
      this.polygons.push(slot);
    }
    this.polygonIndex += 1;
    const vertices = points.map((point) => new THREE.Vector2(point.x, this.sceneY(point.y)));
    const topologyKey = polygonTopologyKey(vertices);
    if (slot.vertexCount !== vertices.length || slot.topologyKey !== topologyKey) {
      const triangles = THREE.ShapeUtils.triangulateShape(vertices, []);
      slot.body.geometry.dispose();
      slot.body.geometry = new THREE.BufferGeometry();
      slot.body.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(vertices.length * 3), 3));
      slot.body.geometry.setIndex(triangles.flat());
      slot.outline.geometry.dispose();
      slot.outline.geometry = new THREE.BufferGeometry();
      slot.outline.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(vertices.length * 3), 3));
      slot.vertexCount = vertices.length;
      slot.topologyKey = topologyKey;
    }
    const bodyPositions = slot.body.geometry.getAttribute("position");
    const outlinePositions = slot.outline.geometry.getAttribute("position");
    vertices.forEach((point, index) => {
      bodyPositions.setXYZ(index, point.x, point.y, 0);
      outlinePositions.setXYZ(index, point.x, point.y, 0.01);
    });
    bodyPositions.needsUpdate = true;
    outlinePositions.needsUpdate = true;
    slot.body.visible = true;
    slot.body.position.set(0, 0, z);
    slot.body.renderOrder = z * 10;
    slot.outline.renderOrder = z * 10 + 1;
    slot.body.material.color.copy(colorValue(color));
    slot.body.material.opacity = opacity;
    slot.outline.visible = Boolean(border);
    if (border) {
      slot.outline.material.color.copy(colorValue(border));
      slot.outline.material.opacity = opacity;
    }
    return slot.body;
  }

  circle({ x, y, radius, color = "#ffffff", opacity = 1, border = null, z = 0 }) {
    let slot = this.circles[this.circleIndex];
    if (!slot) {
      const material = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false });
      const body = new THREE.Mesh(this.disc, material);
      const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: 25 }, (_, index) => {
          const angle = index / 24 * Math.PI * 2;
          return new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0.01);
        }),
      ), new THREE.LineBasicMaterial({ depthTest: false, transparent: true }));
      body.add(outline);
      this.group.add(body);
      slot = { body, outline };
      this.circles.push(slot);
    }
    this.circleIndex += 1;
    slot.body.visible = true;
    slot.body.position.set(x, this.sceneY(y), z);
    slot.body.renderOrder = z * 10;
    slot.outline.renderOrder = z * 10 + 1;
    slot.body.scale.set(radius, radius, 1);
    slot.body.material.color.copy(colorValue(color));
    slot.body.material.opacity = opacity;
    slot.outline.visible = Boolean(border);
    if (border) {
      slot.outline.material.color.copy(colorValue(border));
      slot.outline.material.opacity = opacity;
    }
    return slot.body;
  }

  line({ x1, y1, x2, y2, width = 2, color = "#ffffff", opacity = 1, z = 0 }) {
    let body = this.lines[this.lineIndex];
    if (!body) {
      body = new THREE.Mesh(this.plane, new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false }));
      this.group.add(body);
      this.lines.push(body);
    }
    this.lineIndex += 1;
    const sceneY1 = this.sceneY(y1);
    const sceneY2 = this.sceneY(y2);
    const dx = x2 - x1;
    const dy = sceneY2 - sceneY1;
    body.visible = true;
    body.position.set((x1 + x2) / 2, (sceneY1 + sceneY2) / 2, z);
    body.renderOrder = z * 10;
    body.rotation.z = Math.atan2(dy, dx);
    body.scale.set(Math.hypot(dx, dy), width, 1);
    body.material.color.copy(colorValue(color));
    body.material.opacity = opacity;
    return body;
  }

  rect({ x, y, width, height, color = "#ffffff", opacity = 1, border = null, radius = 0, z = 0 }) {
    let slot = this.rects[this.rectIndex];
    if (!slot) {
      const material = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false });
      const body = new THREE.Mesh(this.plane, material);
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(this.plane), new THREE.LineBasicMaterial({ depthTest: false }));
      body.add(outline);
      this.group.add(body);
      slot = { body, outline };
      this.rects.push(slot);
    }
    this.rectIndex += 1;
    slot.body.visible = true;
    slot.body.position.set(x + width / 2, this.sceneY(y + height / 2), z);
    slot.body.renderOrder = z * 10;
    slot.outline.renderOrder = z * 10 + 1;
    slot.body.scale.set(width, height, 1);
    slot.body.material.color.copy(colorValue(color));
    slot.body.material.opacity = opacity;
    slot.body.material.needsUpdate = true;
    slot.outline.visible = Boolean(border);
    if (border) slot.outline.material.color.copy(colorValue(border));
    slot.body.userData.radius = radius;
    return slot.body;
  }

  text(text, { x, y, width = 180, height = 34, color = "#15120f", fontSize = 20, align = "left", weight = 700, z = 2 } = {}) {
    let slot = this.texts[this.textIndex];
    if (!slot) {
      const canvas = this.runtime.createOffscreenCanvas(2, 2);
      const texture = createTextTexture(canvas);
      const sprite = new THREE.Mesh(this.plane, new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
      this.group.add(sprite);
      slot = { canvas, texture, sprite, key: "" };
      this.texts.push(slot);
    }
    this.textIndex += 1;
    const pixelRatio = 2;
    const textureWidth = Math.max(2, Math.ceil(width * pixelRatio));
    const textureHeight = Math.max(2, Math.ceil(height * pixelRatio));
    const key = `${text}|${color}|${fontSize}|${align}|${weight}|${textureWidth}|${textureHeight}`;
    if (slot.key !== key) {
      if (slot.canvas.width !== textureWidth || slot.canvas.height !== textureHeight) {
        slot.texture.dispose();
        slot.canvas.width = textureWidth;
        slot.canvas.height = textureHeight;
        slot.texture = createTextTexture(slot.canvas);
        slot.sprite.material.map = slot.texture;
        slot.sprite.material.needsUpdate = true;
      }
      const context = slot.canvas.getContext("2d");
      context.clearRect(0, 0, slot.canvas.width, slot.canvas.height);
      context.fillStyle = color;
      context.font = `${weight} ${fontSize * pixelRatio}px "PingFang SC", "Microsoft YaHei", sans-serif`;
      context.textBaseline = "middle";
      context.textAlign = align;
      const padding = 4 * pixelRatio;
      const px = align === "center" ? slot.canvas.width / 2 : align === "right" ? slot.canvas.width - padding : padding;
      context.fillText(String(text), px, slot.canvas.height / 2, slot.canvas.width - padding * 2);
      slot.texture.needsUpdate = true;
      slot.key = key;
    }
    slot.sprite.visible = true;
    slot.sprite.position.set(x + width / 2, this.sceneY(y + height / 2), z);
    slot.sprite.renderOrder = z * 10 + 5;
    slot.sprite.scale.set(width, height, 1);
    return slot.sprite;
  }

  end() {
    for (let index = this.rectIndex; index < this.rects.length; index += 1) this.rects[index].body.visible = false;
    for (let index = this.circleIndex; index < this.circles.length; index += 1) this.circles[index].body.visible = false;
    for (let index = this.lineIndex; index < this.lines.length; index += 1) this.lines[index].visible = false;
    for (let index = this.polygonIndex; index < this.polygons.length; index += 1) this.polygons[index].body.visible = false;
    for (let index = this.textIndex; index < this.texts.length; index += 1) this.texts[index].sprite.visible = false;
  }
}
