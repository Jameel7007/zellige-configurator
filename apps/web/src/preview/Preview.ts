// The 3D view of the panel: one renderer, two meshes (glazed pieces and gold ones) on a mortar
// bed, shown in one of three settings:
//
//   studio  the panel alone on a table (the default: best for judging pattern and colour)
//   wall    hung on a wall above a paved floor
//   floor   laid flush into a paved floor
//
// The scene is in pattern units. A room is in metres, so the room settings need the scale
// (centimetres per unit): the paving stones are always 60 cm, and it is the panel that looks
// bigger or smaller against them when the scale changes.
//
// It draws only when something changed (a new panel, a colour, the camera, the window). A
// configurator sits open in a tab for a long time; a 60 fps loop drawing the same picture
// would keep the fan running for nothing.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Palette } from '@zellige/engine';
import { pieceColours, vertexColours } from '../mesh/colour';
import type { MeshPart, PanelMesh } from '../mesh/panelMesh';
import { LIGHTS, SETTINGS, sunDirection, type LightId, type SettingId } from './settings';

const LOOK = {
  FOV: 32,
  MORTAR: '#b3a892',
  WALL: '#ece5d8',
  FLOOR: '#b7a58c',
  BED_MARGIN: 0.9,        // mortar showing around the panel, in pattern units
  BED_DEPTH: 1.6,
  TILE_TOP: 0.3,          // a floor laid flush sits just under the tiles' faces
  FILL: 0.9,              // share of the view the subject may fill at rest
  MAX_RATIO: 2,
  MAX_PIXELS: 5e6,        // the drawing buffer never exceeds this (Rosette measured why)
  // Glaze is glass: smooth enough for a clear highlight (the lean of each face, mesh/panelMesh.ts,
  // is what spreads those highlights across the panel).
  // The room's reflection is kept low: at 0.7 a low camera saw mostly milky reflection and
  // the dark glazes went pale. The sun's own highlight is what should catch the eye.
  GLAZE: { roughness: 0.18, metalness: 0, envMapIntensity: 0.38 },
  GOLD: { roughness: 0.3, metalness: 1, envMapIntensity: 1.4 },
  PAVER_M: 0.6,           // the room's floor is paved in squares this size
  SKIRT_M: 0.09,          // height of the skirting board along the wall
  // The room, in metres.
  HANG_M: 0.3,            // gap between the floor and the bottom of a hung panel
  ROOM_M: 40,             // walls and floors are simply large: their edges are never in view
};

const deg = THREE.MathUtils.degToRad;

export class Preview {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(LOOK.FOV, 1, 0.5, 6000);
  private controls: OrbitControls;
  private envMap: THREE.Texture;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private panel = new THREE.Group();       // pieces + bed: moved and turned as one
  private bed: THREE.Mesh;
  private table: THREE.Mesh;               // studio: an invisible table that only takes the shadow
  private wall: THREE.Mesh;
  private skirt: THREE.Mesh;
  private paver = { value: 30 };           // pattern units per paving stone (a shader uniform)
  private floor = new THREE.Group();       // one slab (wall) or four around the panel (floor)
  private floorMaterial: THREE.MeshStandardMaterial;
  private glaze: THREE.Mesh;
  private gold: THREE.Mesh;
  private mesh: PanelMesh | null = null;
  private palette: Palette | null = null;
  private colours: Float32Array | null = null;
  private outer = 0;
  private setting: SettingId = 'studio';
  private light: LightId = 'day';
  private sunAzimuth: number | null = null;
  private unitCm = 2;
  /** What the resting camera frames, and where it looks. Set by layout(). */
  private subject: THREE.Vector3[] = [];
  private centre = new THREE.Vector3();
  private reach = 1;
  private frame = 0;
  private frames = 0;
  private observer: ResizeObserver;
  private disposed = false;
  /** Has the customer moved the camera since it was last framed? */
  private moved = false;
  /** Pixels at the top of the canvas covered by the page's controls. */
  private topInset = 0;

  /** Throws if WebGL is not available. */
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);   // the page's background shows through
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.envMap = pmrem.fromScene(room, 0.04).texture;
    pmrem.dispose();
    room.dispose();
    this.scene.environment = this.envMap;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x9c907e, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 3;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    // Since r163 a material that only inherits scene.environment ignores its own
    // envMapIntensity, so each material is given the map itself.
    const tile = (o: typeof LOOK.GLAZE) => new THREE.MeshStandardMaterial({ vertexColors: true, envMap: this.envMap, ...o });
    const matte = (color: string, roughness = 0.95) => new THREE.MeshStandardMaterial({ color, roughness, envMap: this.envMap, envMapIntensity: 0.25 });
    this.glaze = new THREE.Mesh(new THREE.BufferGeometry(), tile(LOOK.GLAZE));
    this.gold = new THREE.Mesh(new THREE.BufferGeometry(), tile(LOOK.GOLD));
    for (const m of [this.glaze, this.gold]) { m.castShadow = true; m.receiveShadow = true; m.visible = false; }

    const box = new THREE.BoxGeometry(1, 1, 1);
    this.bed = new THREE.Mesh(box, matte(LOOK.MORTAR));
    this.bed.castShadow = true;
    this.bed.receiveShadow = true;
    this.panel.add(this.glaze, this.gold, this.bed);
    this.panel.visible = false;

    this.table = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.22 }));
    this.table.rotation.x = -Math.PI / 2;
    this.table.receiveShadow = true;

    this.wall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), matte(LOOK.WALL));
    this.wall.receiveShadow = true;
    this.skirt = new THREE.Mesh(box, matte('#f4efe6', 0.7));
    this.skirt.castShadow = this.skirt.receiveShadow = true;
    this.floorMaterial = matte(LOOK.FLOOR, 0.62);
    this.pave(this.floorMaterial);
    for (let i = 0; i < 4; i++) {
      const slab = new THREE.Mesh(box, this.floorMaterial);
      slab.receiveShadow = true;
      this.floor.add(slab);
    }

    this.scene.add(this.panel, this.table, this.wall, this.skirt, this.floor);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.addEventListener('change', this.invalidate);
    this.controls.addEventListener('start', () => { this.moved = true; });

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    canvas.addEventListener('webglcontextrestored', this.invalidate);
    this.applyLight();
    this.resize();
  }

  /** Show a panel. `outer` is its half-width with the border, in pattern units. */
  setPanel(mesh: PanelMesh, outer: number) {
    const resized = outer !== this.outer;
    this.mesh = mesh;
    this.fill(this.glaze, mesh.glaze, outer);
    this.fill(this.gold, mesh.gold, outer);
    this.colours = null;
    if (this.palette) this.paint();
    this.panel.visible = true;
    if (resized) {
      const prev = this.outer;
      this.outer = outer;
      // A drag on the empty view before the first panel arrived is not a view to keep.
      if (!prev) this.moved = false;
      this.layout(prev ? outer / prev : 0);
    }
    this.canvas.dataset.pieces = String(mesh.pieces);
    this.invalidate();
  }

  /** Repaint with a palette. Cheap: no geometry is rebuilt. */
  setPalette(palette: Palette) {
    this.palette = palette;
    if (this.mesh) { this.paint(); this.invalidate(); }
  }

  /** Where the panel is shown, and how many centimetres a pattern unit is in that room. */
  setRoom(setting: SettingId, unitCm: number) {
    const changedSetting = setting !== this.setting;
    if (!changedSetting && unitCm === this.unitCm) return;
    this.setting = setting;
    this.unitCm = unitCm;
    // A new setting is a new picture: frame it afresh. In the studio the scale changes nothing.
    if (changedSetting) this.moved = false;
    if (this.outer && (changedSetting || setting !== 'studio')) this.layout(0);
  }

  /** Tell the view how much of its top edge the page's controls cover, so framing keeps clear of them. */
  setTopInset(px: number) {
    if (px === this.topInset) return;
    this.topInset = px;
    if (this.outer && !this.moved) this.resetView();
  }

  setLight(light: LightId) {
    if (light === this.light) return;
    this.light = light;
    this.applyLight();
    this.invalidate();
  }

  /** Move the sun round the panel: degrees from straight on, or null for the light's own place. */
  setSun(azimuth: number | null) {
    if (azimuth === this.sunAzimuth) return;
    this.sunAzimuth = azimuth;
    if (this.outer) this.placeSun();
    this.invalidate();
  }

  /** Put the camera back where it started, framing the whole subject. */
  resetView() {
    if (!this.outer) return;
    const d = this.restDistance();
    this.controls.target.copy(this.centre);
    this.camera.position.copy(this.restDirection()).multiplyScalar(d).add(this.centre);
    this.limitZoom(d);
    this.controls.update();
    this.moved = false;
    this.invalidate();
  }

  /** Turn the camera from the keyboard: degrees round the panel, and degrees up or down. */
  orbit(round: number, tilt: number) {
    if (!this.outer) return;
    const c = this.controls, t = c.target;
    const s = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(t));
    s.theta = Math.min(c.maxAzimuthAngle, Math.max(c.minAzimuthAngle, s.theta + deg(round)));
    s.phi = Math.min(c.maxPolarAngle, Math.max(Math.max(0.02, c.minPolarAngle), s.phi + deg(tilt)));
    this.camera.position.setFromSpherical(s).add(t);
    this.moved = true;
    c.update();
    this.invalidate();
  }

  /** Move the camera nearer (k < 1) or further (k > 1), within the same limits as the wheel. */
  zoom(k: number) {
    if (!this.outer) return;
    const c = this.controls, offset = this.camera.position.clone().sub(c.target);
    offset.setLength(Math.min(c.maxDistance, Math.max(c.minDistance, offset.length() * k)));
    this.camera.position.copy(c.target).add(offset);
    this.moved = true;
    c.update();
    this.invalidate();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.canvas.removeEventListener('webglcontextrestored', this.invalidate);
    this.controls.dispose();
    const seen = new Set<THREE.BufferGeometry | THREE.Material>();
    this.scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      for (const r of [m.geometry, m.material as THREE.Material]) if (!seen.has(r)) { seen.add(r); r.dispose(); }
    });
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
   * Place everything for the current setting, panel size and scale, then frame it.
   * `rescale` > 0: only the panel's size changed by that factor, so a camera the customer has
   * moved keeps its angle and relative zoom. Otherwise the view is framed afresh, unless they
   * have moved it (then it is left alone and only its limits are updated).
   */
  private layout(rescale: number) {
    const o = this.outer, half = o + LOOK.BED_MARGIN;
    const m = 100 / this.unitCm;                       // pattern units per metre
    const room = LOOK.ROOM_M * m;
    const s = this.setting;

    this.bed.scale.set(2 * half, LOOK.BED_DEPTH, 2 * half);
    this.bed.position.y = -LOOK.BED_DEPTH / 2;         // its top is y = 0, the bottom of the grout
    this.table.visible = s === 'studio';
    this.wall.visible = this.skirt.visible = this.floor.visible = s !== 'studio';
    this.paver.value = LOOK.PAVER_M * m;
    const skirtH = LOOK.SKIRT_M * m, skirtD = 0.015 * m;
    this.panel.rotation.set(0, 0, 0);
    this.panel.position.set(0, 0, 0);
    const slabs = this.floor.children as THREE.Mesh[];
    const corners = (y: number) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => new THREE.Vector3(x * half, y, z * half));

    if (s === 'studio') {
      this.table.scale.setScalar(o * 12);
      this.table.position.y = -LOOK.BED_DEPTH;
      this.subject = [...corners(0.5), ...corners(-LOOK.BED_DEPTH)];
      this.centre.set(0, 0, 0);
      this.reach = half * 1.5;
    } else if (s === 'wall') {
      // The panel stands up against the wall (z = 0), its face towards +z, above a floor at y = 0.
      const cy = LOOK.HANG_M * m + half;
      this.panel.rotation.x = Math.PI / 2;
      this.panel.position.set(0, cy, LOOK.BED_DEPTH);
      this.wall.scale.set(room, room, 1);
      this.wall.rotation.set(0, 0, 0);
      this.wall.position.set(0, room / 2 - 1, 0);
      slabs.forEach((b, i) => { b.visible = i === 0; });
      slabs[0].scale.set(room, 1, room);
      slabs[0].position.set(0, -0.5, room / 2 - 1);
      this.skirt.scale.set(room, skirtH, skirtD);
      this.skirt.position.set(0, skirtH / 2, skirtD / 2);
      // Framed on the panel and the strip of floor under it.
      const top = cy + half;
      this.subject = [new THREE.Vector3(-half, 0, 0), new THREE.Vector3(half, 0, 0.5 * m), new THREE.Vector3(-half, top, 0), new THREE.Vector3(half, top, 0)];
      this.centre.set(0, top / 2, 0);
      this.reach = Math.max(half, top) * 1.1;
    } else {
      // The panel lies in the floor; four slabs around it bring the floor up flush with the tiles.
      const y = LOOK.TILE_TOP, far = room / 2;
      slabs.forEach(b => { b.visible = true; });
      const place = (b: THREE.Mesh, x0: number, x1: number, z0: number, z1: number) => {
        b.scale.set(x1 - x0, LOOK.BED_DEPTH + y, z1 - z0);
        b.position.set((x0 + x1) / 2, (y - LOOK.BED_DEPTH) / 2, (z0 + z1) / 2);
      };
      place(slabs[0], -far, far, -far, -half);     // behind
      place(slabs[1], -far, far, half, far);       // in front
      place(slabs[2], -far, -half, -half, half);   // left
      place(slabs[3], half, far, -half, half);     // right
      const back = -(half + 1.6 * m);
      this.wall.scale.set(room, room, 1);
      this.wall.rotation.set(0, 0, 0);
      this.wall.position.set(0, room / 2 - 1, back);
      this.skirt.scale.set(room, skirtH, skirtD);
      this.skirt.position.set(0, y + skirtH / 2, back + skirtD / 2);
      this.subject = corners(y);
      this.centre.set(0, 0, 0);
      this.reach = half * 1.5;
    }

    // In a room the camera stays in the room: above the floor, and in front of the wall.
    this.controls.maxPolarAngle = deg(s === 'studio' ? 84 : 88);
    this.controls.minAzimuthAngle = s === 'studio' ? -Infinity : deg(s === 'wall' ? -78 : -80);
    this.controls.maxAzimuthAngle = s === 'studio' ? Infinity : deg(s === 'wall' ? 78 : 80);

    this.placeSun();
    if (rescale > 0 && this.moved && s === 'studio') this.rescaleView(rescale);
    else if (!this.moved) this.resetView();
    else this.limitZoom(this.restDistance());
    this.canvas.dataset.setting = s;
    this.invalidate();
  }

  /**
   * Draw paving on a material: square stones with a thin dark joint, each stone a slightly
   * different tone. It is worked out from each pixel's position in the room, not from a
   * texture, so the four slabs around a floor panel line up with no seams and the stones
   * stay 60 cm whatever the scale.
   */
  private pave(material: THREE.MeshStandardMaterial) {
    const insert = (src: string, anchor: string, code: string) => {
      if (!src.includes(anchor)) throw new Error(`Preview: shader anchor not found: ${anchor}`);
      return src.replace(anchor, `${anchor}\n${code}`);
    };
    material.onBeforeCompile = shader => {
      shader.uniforms.uPaver = this.paver;
      shader.vertexShader = insert(insert(shader.vertexShader, '#include <common>', 'varying vec3 vRoomPos;'),
        '#include <project_vertex>', 'vRoomPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = insert(insert(shader.fragmentShader, '#include <common>', 'varying vec3 vRoomPos;\nuniform float uPaver;'),
        '#include <color_fragment>', `
        {
          vec2 st = vRoomPos.xz / uPaver + 0.5;
          vec2 cell = floor(st), f = abs(fract(st) - 0.5);
          float edge = 0.5 - max(f.x, f.y);                        // 0 on a joint, 0.5 at a stone's centre
          float w = max(fwidth(st.x), fwidth(st.y));
          float joint = 1.0 - smoothstep(0.006, 0.006 + 1.5 * w, edge);
          joint *= 1.0 - smoothstep(0.02, 0.2, w);                   // fade out where stones are a few pixels wide
          float tone = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
          diffuseColor.rgb *= mix(0.94, 1.05, tone) * (1.0 - 0.45 * joint);
        }`);
    };
  }

  private applyLight() {
    const l = LIGHTS[this.light];
    this.sun.color.set(l.sun);
    this.sun.intensity = l.sunIntensity;
    this.hemi.color.set(l.sky);
    this.hemi.groundColor.set(l.ground);
    this.hemi.intensity = l.skyIntensity;
    this.renderer.toneMappingExposure = l.exposure;
    this.sun.shadow.intensity = l.shadow;
    (this.glaze.material as THREE.MeshStandardMaterial).envMapIntensity = LOOK.GLAZE.envMapIntensity * l.reflect;
    (this.gold.material as THREE.MeshStandardMaterial).envMapIntensity = LOOK.GOLD.envMapIntensity * l.reflect;
    this.canvas.dataset.light = this.light;
    if (this.outer) this.placeSun();
  }

  /** The sun shines from the light's direction onto the subject; its shadow box covers it. */
  private placeSun() {
    const [x, y, z] = sunDirection(this.light, this.sunAzimuth);
    this.canvas.dataset.sun = String(this.sunAzimuth ?? LIGHTS[this.light].azimuth);
    const r = this.reach;
    this.sun.target.position.copy(this.centre);
    this.sun.position.set(x, y, z).multiplyScalar(r * 3).add(this.centre);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -r * 1.6;
    cam.right = cam.top = r * 1.6;
    cam.near = r * 0.5;
    cam.far = r * 6;
    cam.updateProjectionMatrix();
  }

  private restDirection() {
    const { elevation, azimuth } = SETTINGS[this.setting];
    const el = deg(elevation), az = deg(azimuth);
    return new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  }

  /**
   * Distance from which the whole subject fits inside LOOK.FILL of the view, seen from the
   * resting angle. For a camera at centre + d·dir, a point p sits at depth d − p·dir and at
   * (p·right, p·up) across the view (p measured from the centre), so each point gives the
   * smallest d that keeps it inside; the largest of those is the answer. Exact, so a tall
   * phone view and a wide desktop one are both framed without trial and error.
   */
  private restDistance() {
    const dir = this.restDirection();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize();
    const up = new THREE.Vector3().crossVectors(dir, right);
    const tan = Math.tan(deg(LOOK.FOV) / 2);
    const tanV = tan * LOOK.FILL, tanH = tanV * this.camera.aspect;
    // The page's controls lie over the top of the view: points above the centre get less room
    // (the inset as a share of the half-height), but never less than half of it.
    const h = this.canvas.clientHeight || 1;
    const tanTop = tan * Math.max(LOOK.FILL / 2, LOOK.FILL - (2 * this.topInset) / h);
    const p = new THREE.Vector3();
    let d = 0;
    for (const q of this.subject) {
      p.copy(q).sub(this.centre);
      const y = p.dot(up);
      d = Math.max(d, p.dot(dir) + Math.max(Math.abs(p.dot(right)) / tanH, y > 0 ? y / tanTop : -y / tanV));
    }
    return d;
  }

  private limitZoom(rest: number) {
    this.controls.minDistance = this.outer * 0.18;
    this.controls.maxDistance = rest * 1.7;
  }

  /** A new size keeps the customer's angle and relative zoom (studio only: its centre is the origin). */
  private rescaleView(k: number) {
    const t = this.controls.target;
    const offset = this.camera.position.clone().sub(t).multiplyScalar(k);
    t.multiplyScalar(k);
    this.camera.position.copy(t).add(offset);
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
