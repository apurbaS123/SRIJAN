/**
 * The WebGL side of the glass hero: a tilted slab of smoked-glass shards with the
 * page printed on them, a live cut pattern, hover lift, and the shatter / reassemble
 * flight. Loaded on the client only (see GlassHero).
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { drawPage, type Layout } from "./layout";

type V2 = [number, number];

// ── Cut pattern (panel-normalised, x right, y down) ─────────
const POINTS: Record<string, { p: V2; kind: "corner" | "edge" | "junction" }> = {
  TL: { p: [0, 0], kind: "corner" },
  TR: { p: [1, 0], kind: "corner" },
  BR: { p: [1, 1], kind: "corner" },
  BL: { p: [0, 1], kind: "corner" },
  tAB: { p: [0.22, 0], kind: "edge" },
  tBC: { p: [0.515, 0], kind: "edge" },
  tCE: { p: [0.84, 0], kind: "edge" },
  bAD: { p: [0.34, 1], kind: "edge" },
  bDE: { p: [0.865, 1], kind: "edge" },
  J0: { p: [0.385, 0.72], kind: "junction" },
  J1: { p: [0.48, 0.62], kind: "junction" },
  J2: { p: [0.716, 0.49], kind: "junction" },
};
const CELLS = [
  ["TL", "tAB", "J0", "bAD", "BL"],
  ["tAB", "tBC", "J1", "J0"],
  ["tBC", "tCE", "J2", "J1"],
  ["J0", "J1", "J2", "bDE", "bAD"],
  ["tCE", "TR", "BR", "bDE", "J2"],
];

// Deterministic per-point drift so the pattern is the same on every load.
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}
const DRIFT = (() => {
  const r = rng(7);
  const out: Record<string, { px: number; py: number; fx: number; fy: number }> = {};
  for (const k of Object.keys(POINTS)) out[k] = { px: 10 + r() * 10, py: 10 + r() * 10, fx: r() * 6.28, fy: r() * 6.28 };
  return out;
})();

const easeInCubic = (t: number) => t * t * t;
const easeOutBack = (t: number) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

const FLY = 0.72;
const STAGGER = 0.03;

// ── Geometry helpers ───────────────────────────────────────

function area(pts: V2[]) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

function inset(pts: V2[], d: number): V2[] {
  const n = pts.length;
  const ccw = area(pts) > 0;
  const lines = pts.map((p, i) => {
    const q = pts[(i + 1) % n];
    let dx = q[0] - p[0], dy = q[1] - p[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const nx = ccw ? -dy : dy, ny = ccw ? dx : -dx;
    return { p: [p[0] + nx * d, p[1] + ny * d] as V2, d: [dx, dy] as V2 };
  });
  return lines.map((l2, i) => {
    const l1 = lines[(i - 1 + n) % n];
    const cross = l1.d[0] * l2.d[1] - l1.d[1] * l2.d[0];
    if (Math.abs(cross) < 1e-6) return l2.p;
    const t = ((l2.p[0] - l1.p[0]) * l2.d[1] - (l2.p[1] - l1.p[1]) * l2.d[0]) / cross;
    return [l1.p[0] + l1.d[0] * t, l1.p[1] + l1.d[1] * t] as V2;
  });
}

function roundedShape(pts: V2[], r: number) {
  const shape = new THREE.Shape();
  const n = pts.length;
  pts.forEach((v, i) => {
    const p = pts[(i - 1 + n) % n], q = pts[(i + 1) % n];
    const lp = Math.hypot(p[0] - v[0], p[1] - v[1]), lq = Math.hypot(q[0] - v[0], q[1] - v[1]);
    const t = Math.min(r, lp * 0.45, lq * 0.45);
    const a: V2 = [v[0] + ((p[0] - v[0]) / lp) * t, v[1] + ((p[1] - v[1]) / lp) * t];
    const b: V2 = [v[0] + ((q[0] - v[0]) / lq) * t, v[1] + ((q[1] - v[1]) / lq) * t];
    if (i === 0) shape.moveTo(a[0], a[1]);
    else shape.lineTo(a[0], a[1]);
    shape.quadraticCurveTo(v[0], v[1], b[0], b[1]);
  });
  shape.closePath();
  return shape;
}

function centroid(pts: V2[]): V2 {
  let x = 0, y = 0;
  for (const p of pts) { x += p[0]; y += p[1]; }
  return [x / pts.length, y / pts.length];
}

// ── Materials ──────────────────────────────────────────────

interface GlowUniforms {
  uPointer: { value: THREE.Vector3 };
  uGlow: { value: number };
  uGlowR: { value: number };
}

function glassMaterial(glow?: GlowUniforms) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0x18121f,
    roughness: 0.36,
    metalness: 0,
    clearcoat: 0.7,
    clearcoatRoughness: 0.12,
    specularIntensity: 0.7,
    iridescence: 0.55,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [250, 650],
    envMapIntensity: 1,
  });
  if (glow) {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uPointer = glow.uPointer;
      sh.uniforms.uGlow = glow.uGlow;
      sh.uniforms.uGlowR = glow.uGlowR;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vGlowPos;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvGlowPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec3 vGlowPos;\nuniform vec3 uPointer;\nuniform float uGlow;\nuniform float uGlowR;",
        )
        .replace(
          "#include <opaque_fragment>",
          // Srijan violet glow around the pointer.
          "float gd = distance(vGlowPos.xy, uPointer.xy) / uGlowR;\n" +
            "outgoingLight += vec3(.52, .32, .9) * .16 * exp(-1.6 * gd * gd) * uGlow;\n" +
            "#include <opaque_fragment>",
        );
    };
    m.customProgramCacheKey = () => "srijan-glass-glow";
  }
  return m;
}

// ── Pieces ─────────────────────────────────────────────────

interface Piece {
  group: THREE.Group;
  glass: THREE.Mesh;
  print: THREE.Mesh;
  mat: THREE.MeshPhysicalMaterial;
  /** Rest position (slab-local) of the pivot. */
  pivot: THREE.Vector3;
  half: V2;
  nav: boolean;
  cell: number;
  order: number;
  lift: number; liftV: number;
  tipX: number; tipXV: number;
  tipY: number; tipYV: number;
  fly: { v: THREE.Vector3; g: THREE.Vector3; axis: THREE.Vector3; ang: number };
}

type Phase = "in" | "rest" | "out" | "gone";

export class GlassScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 1, 10000);
  private slab = new THREE.Group();
  private pieces: Piece[] = [];
  private printMat: THREE.MeshBasicMaterial;
  private texture: THREE.CanvasTexture;
  private pageCanvas = document.createElement("canvas");
  private glow: GlowUniforms = {
    uPointer: { value: new THREE.Vector3() },
    uGlow: { value: 0 },
    uGlowR: { value: 300 },
  };
  private raycaster = new THREE.Raycaster();
  private L: Layout | null = null;
  private hoverItem: string | null = null;

  private pointer = { x: 0, y: 0, active: false };
  private ndc = new THREE.Vector2();
  private tilt = { x: 0, y: 0 };
  private panelPtr = { u: 0.5, v: 0.5, amt: 0 };
  private hovered = -1;

  private phase: Phase = "gone";
  private phaseT = 0;
  private sliver: { group: THREE.Group; mesh: THREE.Mesh; half: V2; from: number; to: number; t0: number; hover: number; tipX: number; tipY: number } | null = null;
  private sliverHover = false;

  private clock = new THREE.Clock();
  private time = 0;
  private sinceRebuild = 0;
  private raf = 0;
  private running = false;

  /** Called each frame with the projected screen corners (TL, TR, BR, BL) of the block. */
  onFrame: ((corners: [number, number][]) => void) | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x06030b, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.42;
    pmrem.dispose();

    // Soft white-lavender key from the top-left, faint violet rim from the bottom-right.
    const key = new THREE.DirectionalLight(0xe8e2ff, 1.15);
    key.position.set(-0.7, 0.9, 1);
    const rim = new THREE.DirectionalLight(0x9f1eff, 0.35);
    rim.position.set(0.8, -0.6, 0.6);
    this.scene.add(key, rim, this.slab);

    this.texture = new THREE.CanvasTexture(this.pageCanvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.printMat = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
  }

  // ── Public API ───────────────────────────────────────────

  setLayout(L: Layout, hover: string | null) {
    const resized = !this.L || this.L.W !== L.W || this.L.H !== L.H;
    this.L = L;
    this.hoverItem = hover;
    if (resized) {
      this.renderer.setSize(L.W, L.H, false);
      this.camera.aspect = L.W / L.H;
      this.camera.position.set(0, 0, L.H / 2 / Math.tan(THREE.MathUtils.degToRad(15)));
      this.camera.near = this.camera.position.z / 20;
      this.camera.far = this.camera.position.z * 10;
      this.camera.updateProjectionMatrix();
      this.glow.uGlowR.value = 300 * L.S;
      this.buildPieces();
      this.buildSliver();
    }
    this.redraw();
  }

  setHover(id: string | null) {
    if (id === this.hoverItem) return;
    this.hoverItem = id;
    this.redraw();
  }

  setPointer(x: number, y: number, active: boolean) {
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointer.active = active;
  }

  setBackHover(on: boolean) {
    this.sliverHover = on;
  }

  /** Fly every piece in from off-screen. */
  intro() {
    this.randomizeFlights();
    this.phase = "in";
    this.phaseT = this.time + 0.15;
  }

  shatter() {
    if (this.phase === "out" || this.phase === "gone") return;
    this.randomizeFlights();
    this.phase = "out";
    this.phaseT = this.time;
    this.hovered = -1;
    if (this.sliver) Object.assign(this.sliver, { from: 0, to: 1, t0: this.time + 0.3 });
  }

  assemble() {
    if (this.phase !== "gone" && this.phase !== "out") return;
    this.phase = "in";
    this.phaseT = this.time + 0.12;
    if (this.sliver) Object.assign(this.sliver, { from: this.sliverScale(), to: 0, t0: this.time });
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.getDelta();
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  dispose() {
    this.stop();
    for (const p of this.pieces) {
      p.glass.geometry.dispose();
      p.print.geometry.dispose();
      p.mat.dispose();
    }
    if (this.sliver) {
      this.sliver.mesh.geometry.dispose();
      (this.sliver.mesh.material as THREE.Material).dispose();
    }
    this.printMat.dispose();
    this.texture.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }

  // ── Build ────────────────────────────────────────────────

  private redraw() {
    if (!this.L) return;
    const L = this.L;
    const want = Math.min(2, Math.max(1.5, window.devicePixelRatio || 1));
    const scale = Math.min(want, 4096 / L.bw, 4096 / L.bh);
    drawPage(this.pageCanvas, L, this.hoverItem, scale);
    this.texture.needsUpdate = true;
  }

  /** Slab-local coordinates of a panel-normalised point. */
  private panelToSlab(u: number, v: number): V2 {
    const L = this.L!;
    return [-L.bw / 2 + u * L.pw, L.bh / 2 - L.panelY - v * L.ph];
  }

  private cellOutline(cell: number, live: boolean): V2[] {
    const L = this.L!;
    const pts = CELLS[cell].map((k) => {
      const def = POINTS[k];
      let [u, v] = def.p;
      if (live && def.kind !== "corner") {
        const d = DRIFT[k];
        u += 0.03 * Math.sin((this.time / d.px) * Math.PI * 2 + d.fx);
        if (def.kind === "junction") v += 0.05 * Math.sin((this.time / d.py) * Math.PI * 2 + d.fy);
        // Push away from the pointer (in the untransposed pattern space).
        const pu = L.portrait ? this.panelPtr.v : this.panelPtr.u;
        const pv = L.portrait ? this.panelPtr.u : this.panelPtr.v;
        const dx = u - pu, dy = v - pv;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.6 && dist > 1e-4 && this.panelPtr.amt > 0) {
          const k2 = 0.05 * (1 - dist / 0.6) * this.panelPtr.amt;
          u += (dx / dist) * k2;
          if (def.kind === "junction") v += (dy / dist) * k2;
        }
      }
      return L.portrait ? ([v, u] as V2) : ([u, v] as V2);
    });
    return pts.map(([u, v]) => this.panelToSlab(u, v));
  }

  private navOutline(): V2[] {
    const L = this.L!;
    const x0 = -L.bw / 2, x1 = L.bw / 2, y0 = L.bh / 2, y1 = L.bh / 2 - L.navH;
    return [[x0, y0], [x0, y1], [x1, y1], [x1, y0]];
  }

  private geometries(outline: V2[], pivot: THREE.Vector3) {
    const L = this.L!;
    const S = L.S;
    const bevel = 2.6 * S;
    const depth = 13 * S;
    const local = outline.map(([x, y]) => [x - pivot.x, y - pivot.y] as V2);
    const contour = inset(local, 7 * S + bevel);
    const shape = roundedShape(contour, 20 * S);
    const glass = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 3,
      curveSegments: 5,
    });
    const print = new THREE.ShapeGeometry(shape, 5);
    const pos = print.attributes.position as THREE.BufferAttribute;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + pivot.x, y = pos.getY(i) + pivot.y;
      uv[i * 2] = (x + L.bw / 2) / L.bw;
      uv[i * 2 + 1] = (y + L.bh / 2) / L.bh;
    }
    print.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    print.translate(0, 0, depth + bevel + 0.2);
    return { glass, print };
  }

  private buildPieces() {
    for (const p of this.pieces) {
      this.slab.remove(p.group);
      p.glass.geometry.dispose();
      p.print.geometry.dispose();
      p.mat.dispose();
    }
    this.pieces = [];
    const outlines: { pts: V2[]; nav: boolean; cell: number }[] = [
      { pts: this.navOutline(), nav: true, cell: -1 },
      ...CELLS.map((_, i) => ({ pts: this.cellOutline(i, false), nav: false, cell: i })),
    ];
    outlines.forEach((o, order) => {
      const [cx, cy] = centroid(o.pts);
      const pivot = new THREE.Vector3(cx, cy, 0);
      let hx = 0, hy = 0;
      for (const [x, y] of o.pts) { hx = Math.max(hx, Math.abs(x - cx)); hy = Math.max(hy, Math.abs(y - cy)); }
      const { glass, print } = this.geometries(o.pts, pivot);
      const mat = glassMaterial(this.glow);
      const glassMesh = new THREE.Mesh(glass, mat);
      glassMesh.userData.piece = order;
      const printMesh = new THREE.Mesh(print, this.printMat);
      printMesh.renderOrder = 1;
      const group = new THREE.Group();
      group.add(glassMesh, printMesh);
      group.position.copy(pivot);
      this.slab.add(group);
      this.pieces.push({
        group, glass: glassMesh, print: printMesh, mat, pivot, half: [hx, hy], nav: o.nav, cell: o.cell, order,
        lift: 0, liftV: 0, tipX: 0, tipXV: 0, tipY: 0, tipYV: 0,
        fly: { v: new THREE.Vector3(), g: new THREE.Vector3(), axis: new THREE.Vector3(1, 0, 0), ang: 0 },
      });
    });
    this.randomizeFlights();
  }

  private rebuildCells() {
    for (const p of this.pieces) {
      if (p.nav) continue;
      const { glass, print } = this.geometries(this.cellOutline(p.cell, true), p.pivot);
      p.glass.geometry.dispose();
      p.print.geometry.dispose();
      p.glass.geometry = glass;
      p.print.geometry = print;
    }
  }

  private randomizeFlights() {
    const L = this.L;
    if (!L) return;
    for (const p of this.pieces) {
      const dir = new THREE.Vector2(p.pivot.x / L.bw + (Math.random() - 0.5) * 0.3, p.pivot.y / L.bh - 0.15);
      if (dir.lengthSq() < 1e-4) dir.set(0, -1);
      dir.normalize();
      const speed = (0.9 + Math.random() * 0.5) * Math.max(L.W, L.H) * 1.05;
      p.fly.v.set(dir.x * speed, dir.y * speed * 0.8 - L.H * 0.25, (420 + Math.random() * 380) * L.S);
      p.fly.g.set(0, -L.H * 1.8, 0);
      p.fly.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      p.fly.ang = (2 + Math.random() * 1.6) * (Math.random() < 0.5 ? -1 : 1);
    }
  }

  private buildSliver() {
    const L = this.L!;
    if (this.sliver) {
      this.scene.remove(this.sliver.group);
      this.sliver.mesh.geometry.dispose();
      (this.sliver.mesh.material as THREE.Material).dispose();
    }
    const k = L.sliver.k;
    const pts: V2[] = L.sliver.pts.map(([fx, fy]) => [(fx - 0.5) * L.W, (0.5 - fy) * L.H]);
    const [cx, cy] = centroid(pts);
    const local = pts.map(([x, y]) => [x - cx, y - cy] as V2);
    let hx = 0, hy = 0;
    for (const [x, y] of local) { hx = Math.max(hx, Math.abs(x)); hy = Math.max(hy, Math.abs(y)); }
    const bevel = 2.4 * k;
    const geo = new THREE.ExtrudeGeometry(roundedShape(inset(local, bevel), 7 * k), {
      depth: 11 * k,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 3,
      curveSegments: 5,
    });
    const mat = glassMaterial();
    mat.iridescence = 0.35;
    mat.envMapIntensity = 1.7;
    mat.clearcoat = 1;
    const mesh = new THREE.Mesh(geo, mat);
    const group = new THREE.Group();
    group.add(mesh);
    group.position.set(cx, cy, 0);
    group.scale.setScalar(0.0001);
    group.visible = false;
    this.scene.add(group);
    const prev = this.sliver;
    this.sliver = { group, mesh, half: [hx, hy], from: prev?.from ?? 0, to: prev?.to ?? 0, t0: prev?.t0 ?? -10, hover: 0, tipX: 0, tipY: 0 };
  }

  private sliverScale() {
    const s = this.sliver!;
    const grow = s.to > s.from;
    const p = clamp01((this.time - s.t0) / (grow ? 0.5 : 0.25));
    const e = grow ? easeOutBack(p) : easeInCubic(p);
    return s.from + (s.to - s.from) * e;
  }

  // ── Frame ────────────────────────────────────────────────

  private frame() {
    const L = this.L;
    if (!L) return;
    const dt = Math.min(this.clock.getDelta(), 1 / 30);
    this.time += dt;

    // Pointer in NDC; tilt toward it.
    const active = this.pointer.active;
    this.ndc.set((this.pointer.x / L.W) * 2 - 1, -(this.pointer.y / L.H) * 2 + 1);
    const deg = THREE.MathUtils.degToRad;
    const ty = active ? this.ndc.x * deg(7) - deg(1.2) : -deg(1.2);
    const tx = active ? -this.ndc.y * deg(5.5) + deg(0.8) : deg(0.8);
    const k = 1 - Math.exp(-dt / 0.3);
    this.tilt.x += (tx - this.tilt.x) * k;
    this.tilt.y += (ty - this.tilt.y) * k;
    this.slab.rotation.set(this.tilt.x, this.tilt.y, 0);
    this.slab.updateMatrixWorld(true);

    // Pointer on the slab plane (for glow + pattern push).
    const assembled = this.phase === "rest";
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(this.slab.quaternion);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, this.slab.localToWorld(new THREE.Vector3(0, 0, 16 * L.S)));
    const hit = new THREE.Vector3();
    const onPlane = this.raycaster.ray.intersectPlane(plane, hit) !== null;
    if (onPlane) this.glow.uPointer.value.copy(hit);
    const glowTarget = active && onPlane && assembled ? 1 : 0;
    this.glow.uGlow.value += (glowTarget - this.glow.uGlow.value) * (1 - Math.exp(-dt / 0.25));

    if (onPlane) {
      const local = this.slab.worldToLocal(hit.clone());
      const u = (local.x + L.bw / 2) / L.pw;
      const v = (L.bh / 2 - L.panelY - local.y) / L.ph;
      this.panelPtr.u += (u - this.panelPtr.u) * (1 - Math.exp(-dt / 0.15));
      this.panelPtr.v += (v - this.panelPtr.v) * (1 - Math.exp(-dt / 0.15));
    }
    this.panelPtr.amt += ((active && assembled ? 1 : 0) - this.panelPtr.amt) * (1 - Math.exp(-dt / 0.4));

    // Live cut pattern, ~45×/s.
    this.sinceRebuild += dt;
    if (this.sinceRebuild >= 1 / 45 && this.phase !== "gone") {
      this.sinceRebuild = 0;
      this.rebuildCells();
    }

    // Hover pick.
    this.hovered = -1;
    if (active && assembled) {
      const hits = this.raycaster.intersectObjects(this.pieces.map((p) => p.glass), false);
      if (hits.length) this.hovered = hits[0].object.userData.piece as number;
    }

    this.updatePieces(dt);
    this.updateSliver(dt);

    this.renderer.render(this.scene, this.camera);
    this.emitCorners();
  }

  private updatePieces(dt: number) {
    const L = this.L!;
    const spring = (x: number, v: number, target: number) => {
      const a = 170 * (target - x) - 19 * v;
      v += a * dt;
      return [x + v * dt, v];
    };
    let allDone = true;
    const e = new THREE.Euler();
    const qTip = new THREE.Quaternion();
    const qFly = new THREE.Quaternion();

    for (const p of this.pieces) {
      // Flight progress, 0 = at rest, 1 = gone.
      let f = this.phase === "gone" ? 1 : 0;
      if (this.phase === "out" || this.phase === "in") {
        const raw = clamp01((this.time - this.phaseT - p.order * STAGGER) / FLY);
        if (raw < 1) allDone = false;
        f = this.phase === "out" ? easeInCubic(raw) : 1 - easeOutBack(raw);
      }

      // Hover lift and tip.
      const isHover = this.hovered === p.order;
      let tLift = 0, tTipX = 0, tTipY = 0;
      if (isHover) {
        tLift = (p.nav ? 32 : 50) * L.S;
        const local = p.group.parent!.worldToLocal(this.glow.uPointer.value.clone());
        const nx = THREE.MathUtils.clamp((local.x - p.pivot.x) / p.half[0], -1, 1);
        const ny = THREE.MathUtils.clamp((local.y - p.pivot.y) / p.half[1], -1, 1);
        const lim = p.nav ? 0.08 : 0.24;
        tTipY = nx * lim;
        tTipX = -ny * lim;
      }
      [p.lift, p.liftV] = spring(p.lift, p.liftV, tLift);
      [p.tipX, p.tipXV] = spring(p.tipX, p.tipXV, tTipX);
      [p.tipY, p.tipYV] = spring(p.tipY, p.tipYV, tTipY);

      const h = THREE.MathUtils.clamp(p.lift / ((p.nav ? 32 : 50) * L.S), 0, 1);
      p.mat.iridescence = 0.55 + 0.45 * h;
      p.mat.envMapIntensity = 1 + 0.9 * h;

      const tt = f * FLY;
      p.group.position.set(
        p.pivot.x + p.fly.v.x * tt + 0.5 * p.fly.g.x * tt * tt,
        p.pivot.y + p.fly.v.y * tt + 0.5 * p.fly.g.y * tt * tt,
        p.pivot.z + p.fly.v.z * tt + p.lift,
      );
      qTip.setFromEuler(e.set(p.tipX, p.tipY, 0));
      qFly.setFromAxisAngle(p.fly.axis, p.fly.ang * f);
      p.group.quaternion.copy(qFly).multiply(qTip);
      p.group.visible = f < 0.999;
    }

    if (allDone && this.phase === "out") this.phase = "gone";
    if (allDone && this.phase === "in") this.phase = "rest";
  }

  private updateSliver(dt: number) {
    const s = this.sliver;
    if (!s) return;
    const scale = this.sliverScale();
    s.group.visible = scale > 0.002;
    s.group.scale.setScalar(Math.max(scale, 0.0001));
    if (!s.group.visible) return;

    let tX = 0, tY = 0;
    if (this.sliverHover && this.pointer.active) {
      const L = this.L!;
      const px = (this.pointer.x / L.W - 0.5) * L.W, py = (0.5 - this.pointer.y / L.H) * L.H;
      tY = THREE.MathUtils.clamp((px - s.group.position.x) / s.half[0], -1, 1) * 0.14;
      tX = -THREE.MathUtils.clamp((py - s.group.position.y) / s.half[1], -1, 1) * 0.14;
    }
    const k = 1 - Math.exp(-dt / 0.12);
    s.tipX += (tX - s.tipX) * k;
    s.tipY += (tY - s.tipY) * k;
    s.hover += ((this.sliverHover ? 1 : 0) - s.hover) * k;
    const wob = this.time * Math.PI * 2;
    s.group.rotation.set(
      0.08 + 0.04 * Math.sin(wob * 1.05 + 1) + s.tipX,
      -0.16 + 0.03 * Math.sin(wob * 0.9) + s.tipY,
      0,
    );
    const m = s.mesh.material as THREE.MeshPhysicalMaterial;
    m.envMapIntensity = 1.7 + 0.5 * s.hover;
  }

  private emitCorners() {
    if (!this.onFrame || !this.L) return;
    const L = this.L;
    const z = 13 * L.S + 2.6 * L.S;
    const pts: [number, number][] = [
      [-L.bw / 2, L.bh / 2], [L.bw / 2, L.bh / 2], [L.bw / 2, -L.bh / 2], [-L.bw / 2, -L.bh / 2],
    ];
    const v = new THREE.Vector3();
    this.onFrame(
      pts.map(([x, y]) => {
        v.set(x, y, z).applyMatrix4(this.slab.matrixWorld).project(this.camera);
        return [((v.x + 1) / 2) * L.W, ((1 - v.y) / 2) * L.H];
      }),
    );
  }
}

/** True if a WebGL2 context can be created. */
export function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!c.getContext("webgl2");
  } catch {
    return false;
  }
}
