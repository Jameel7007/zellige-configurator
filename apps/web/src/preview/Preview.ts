// The 3D view of the panel: one renderer, two meshes (glazed pieces and gold ones), a mortar
// bed and a soft shadow on the table.
//
// It draws only when something changed (a new panel, a new colour, the camera moving, the
// window resizing). A configurator sits open in a tab for a long time; a 60 fps loop drawing
// the same picture would keep the fan running for nothing.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Palette } from '@zellige/engine';
import { pieceColours, vertexColours } from '../mesh/colour';
import type { MeshPart, PanelMesh } from '../mesh/panelMesh';

const LOOK = {
  FOV: 32,
  EXPOSURE: 1.0,
  MORTAR: '#b3a892',
  BED_MARGIN: 0.9,        // mortar showing around the panel
  BED_DEPTH: 1.6,
  ELEVATION: 52,          // degrees above the table, at rest
  AZIMUTH: 22,            // degrees round from straight on
  FILL: 0.9,              // share of the view the panel may fill at rest
  MAX_RATIO: 2,
  MAX_PIXELS: 5e6,        // the drawing buffer never exceeds this (Rosette measured why)
  GLAZE: { roughness: 0.26, metalness: 0, envMapIntensity: 0.7 },
  GOLD: { roughness: 0.32, metalness: 1, envMapIntensity: 1.4 },
};

export class Preview {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(LOOK.FOV, 1, 0.5, 4000);
  private controls: OrbitControls;
  private envMap: THREE.Texture;
  private sun: THREE.DirectionalLight;
  private bed: THREE.Mesh;
  private table: THREE.Mesh;
  private glaze: THREE.Mesh;
  private gold: THREE.Mesh;
  private mesh: PanelMesh | null = null;
  private palette: Palette | null = null;
  private colours: Float32Array | null = null;
  private outer = 0;
  private frame = 0;
  private frames = 0;
  private observer: ResizeObserver;
  private disposed = false;
  /** Has the customer moved the camera since it was last framed? */
  private moved = false;

  /** Throws if WebGL is not available. */
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);   // the page's background shows through
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = LOOK.EXPOSURE;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.envMap = pmrem.fromScene(room, 0.04).texture;
    pmrem.dispose();
    room.dispose();
    this.scene.environment = this.envMap;

    this.scene.add(new THREE.HemisphereLight(0xfff6ea, 0x9c907e, 1.1));
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 2;
    this.scene.add(this.sun, this.sun.target);

    // Since r163 a material that only inherits scene.environment ignores its own
    // envMapIntensity, so each material is given the map itself.
    const material = (o: typeof LOOK.GLAZE) => new THREE.MeshStandardMaterial({ vertexColors: true, envMap: this.envMap, ...o });
    this.glaze = new THREE.Mesh(new THREE.BufferGeometry(), material(LOOK.GLAZE));
    this.gold = new THREE.Mesh(new THREE.BufferGeometry(), material(LOOK.GOLD));
    for (const m of [this.glaze, this.gold]) { m.castShadow = true; m.receiveShadow = true; m.visible = false; }

    this.bed = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: LOOK.MORTAR, roughness: 0.95, envMap: this.envMap, envMapIntensity: 0.25 }),
    );
    this.bed.castShadow = true;
    this.bed.receiveShadow = true;
    this.bed.visible = false;

    // The table is invisible except for the shadow that falls on it.
    this.table = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.22 }));
    this.table.rotation.x = -Math.PI / 2;
    this.table.receiveShadow = true;
    this.scene.add(this.glaze, this.gold, this.bed, this.table);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(84);   // never below the table
    this.controls.addEventListener('change', this.invalidate);
    this.controls.addEventListener('start', () => { this.moved = true; });

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    canvas.addEventListener('webglcontextrestored', this.invalidate);
    this.resize();
  }

  /** Show a panel. `outer` is its half-width with the border, in pattern units. */
  setPanel(mesh: PanelMesh, outer: number) {
    const first = this.mesh === null, resized = outer !== this.outer;
    this.mesh = mesh;
    this.fill(this.glaze, mesh.glaze, outer);
    this.fill(this.gold, mesh.gold, outer);
    this.colours = null;
    if (this.palette) this.paint();

    if (resized) {
      const half = outer + LOOK.BED_MARGIN;
      this.bed.scale.set(2 * half, LOOK.BED_DEPTH, 2 * half);
      this.bed.position.y = -LOOK.BED_DEPTH / 2;   // its top is y = 0, the bottom of the grout
      this.bed.visible = true;
      this.table.scale.setScalar(outer * 12);
      this.table.position.y = -LOOK.BED_DEPTH;

      this.sun.position.set(-0.9 * outer, 2.2 * outer, 1.3 * outer);
      const cam = this.sun.shadow.camera;
      cam.left = cam.bottom = -outer * 1.9;
      cam.right = cam.top = outer * 1.9;
      cam.near = outer * 0.5;
      cam.far = outer * 6;
      cam.updateProjectionMatrix();

      const prev = this.outer;
      this.outer = outer;
      if (first || !this.moved) this.resetView();
      else this.rescaleView(outer / prev);
    }
    this.canvas.dataset.pieces = String(mesh.pieces);
    this.invalidate();
  }

  /** Repaint with a palette. Cheap: no geometry is rebuilt. */
  setPalette(palette: Palette) {
    this.palette = palette;
    if (this.mesh) { this.paint(); this.invalidate(); }
  }

  /** Put the camera back where it started, framing the whole panel. */
  resetView() {
    if (!this.outer) return;
    const el = THREE.MathUtils.degToRad(LOOK.ELEVATION), az = THREE.MathUtils.degToRad(LOOK.AZIMUTH);
    const d = this.restDistance();
    this.controls.target.set(0, 0, 0);
    this.camera.position.set(d * Math.cos(el) * Math.sin(az), d * Math.sin(el), d * Math.cos(el) * Math.cos(az));
    this.limitZoom(d);
    this.controls.update();
    this.moved = false;
    this.invalidate();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.canvas.removeEventListener('webglcontextrestored', this.invalidate);
    this.controls.dispose();
    for (const m of [this.glaze, this.gold, this.bed, this.table]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.envMap.dispose();
    this.renderer.dispose();
  }

  // ---------------------------------------------------------------------------------------

  private fill(target: THREE.Mesh, part: MeshPart, outer: number) {
    target.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(part.position, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(part.normal, 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(part.position.length), 3));
    g.setIndex(new THREE.BufferAttribute(part.index, 1));
    // Known bounds: skips a pass over a million vertices.
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), outer * Math.SQRT2 + 1);
    target.geometry = g;
    target.visible = part.index.length > 0;
  }

  private paint() {
    const mesh = this.mesh!, palette = this.palette!;
    this.colours = pieceColours(mesh.keys, mesh.jitter, palette, this.colours ?? undefined);
    for (const [target, part] of [[this.glaze, mesh.glaze], [this.gold, mesh.gold]] as const) {
      const attr = target.geometry.getAttribute('color') as THREE.BufferAttribute;
      vertexColours(part, this.colours, attr.array as Float32Array);
      attr.needsUpdate = true;
    }
    this.canvas.dataset.palette = Object.values(palette).join(',');
  }

  /**
   * Distance from which the whole mortar bed fits inside LOOK.FILL of the view, seen from the
   * resting angle. For a camera at d·dir looking at the centre, a corner p sits at depth
   * d − p·dir and at (p·right, p·up) across the view, so each corner gives the smallest d that
   * keeps it inside; the largest of those is the answer. Exact, so a tall phone view and a
   * wide desktop one are both framed without trial and error.
   */
  private restDistance() {
    const el = THREE.MathUtils.degToRad(LOOK.ELEVATION), az = THREE.MathUtils.degToRad(LOOK.AZIMUTH);
    const dir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize();
    const up = new THREE.Vector3().crossVectors(dir, right);
    const tanV = Math.tan(THREE.MathUtils.degToRad(LOOK.FOV) / 2) * LOOK.FILL;
    const tanH = tanV * this.camera.aspect;
    const half = this.outer + LOOK.BED_MARGIN, p = new THREE.Vector3();
    let d = 0;
    for (const x of [-half, half]) for (const z of [-half, half]) for (const y of [0.5, -LOOK.BED_DEPTH]) {
      p.set(x, y, z);
      d = Math.max(d, p.dot(dir) + Math.max(Math.abs(p.dot(right)) / tanH, Math.abs(p.dot(up)) / tanV));
    }
    return d;
  }

  private limitZoom(rest: number) {
    this.controls.minDistance = this.outer * 0.18;
    this.controls.maxDistance = rest * 1.7;
  }

  /** A new size keeps the customer's angle and relative zoom. */
  private rescaleView(k: number) {
    const t = this.controls.target;
    t.multiplyScalar(k);
    this.camera.position.sub(t.clone().divideScalar(k)).multiplyScalar(k).add(t);
    this.limitZoom(this.restDistance());
    this.controls.update();
  }

  private resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    const fit = Math.sqrt(LOOK.MAX_PIXELS / (w * h));
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LOOK.MAX_RATIO, Math.max(1, fit)));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // A view the customer has not touched is framed again for the new shape (a phone turned
    // on its side); one they have moved is left where they put it.
    if (this.outer && !this.moved) this.resetView();
    else if (this.outer) this.limitZoom(this.restDistance());
    this.invalidate();
  }

  /** Ask for one frame. Many calls before the next frame draw once. */
  private invalidate = () => {
    if (this.frame || this.disposed) return;
    this.frame = requestAnimationFrame(this.draw);
  };

  private draw = () => {
    this.frame = 0;
    // update() returns true while damping is still easing the camera: then keep going.
    const moving = this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.canvas.dataset.frames = String(++this.frames);
    if (moving) this.invalidate();
  };
}
