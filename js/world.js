import * as THREE from 'three';

// The park is a height field built from "profile" primitives: a 2D height
// profile h(u) extruded across a width. Quarter pipes, kickers, ledges,
// stairs and hills are all profiles. Rails, ledge edges and coping are
// separate grind segments.

const tmpV = new THREE.Vector3();

class Profile {
  constructor({ x, z, rot = 0, width, points, color = 0xb8b4ac, solidEnds = true }) {
    this.x = x; this.z = z;
    this.theta = rot * Math.PI / 2;
    this.s = Math.sin(this.theta); this.c = Math.cos(this.theta);
    this.width = width;
    this.points = points;
    this.color = color;
    this.solidEnds = solidEnds;
    this.u0 = points[0][0];
    this.u1 = points[points.length - 1][0];
    // World-space AABB for quick rejection.
    const corners = [[this.u0, -width / 2], [this.u0, width / 2], [this.u1, -width / 2], [this.u1, width / 2]];
    this.minX = Infinity; this.maxX = -Infinity; this.minZ = Infinity; this.maxZ = -Infinity;
    for (const [u, w] of corners) {
      const p = this.toWorld(u, w);
      this.minX = Math.min(this.minX, p.x); this.maxX = Math.max(this.maxX, p.x);
      this.minZ = Math.min(this.minZ, p.z); this.maxZ = Math.max(this.maxZ, p.z);
    }
    this.maxH = Math.max(...points.map(p => p[1]));
  }

  toWorld(u, w, y = 0) {
    return new THREE.Vector3(this.x + u * this.s + w * this.c, y, this.z + u * this.c - w * this.s);
  }

  // Returns {h, gx, gz} or null when (x, z) is outside the primitive.
  sample(x, z) {
    if (x < this.minX || x > this.maxX || z < this.minZ || z > this.maxZ) return null;
    const dx = x - this.x, dz = z - this.z;
    const u = dx * this.s + dz * this.c;
    const w = dx * this.c - dz * this.s;
    if (w < -this.width / 2 || w > this.width / 2 || u < this.u0 || u > this.u1) return null;
    const pts = this.points;
    let i = 0;
    while (i < pts.length - 2 && u > pts[i + 1][0]) i++;
    const [ua, ha] = pts[i];
    const [ub, hb] = pts[i + 1];
    const span = ub - ua;
    const t = span > 1e-6 ? (u - ua) / span : 1;
    const h = ha + (hb - ha) * t;
    let gu = span > 1e-6 ? (hb - ha) / span : 0;
    if (Math.abs(gu) > 40) gu = 0; // vertical step: treat as flat for normals
    return { h, gx: gu * this.s, gz: gu * this.c };
  }

  buildMesh(material) {
    const W = this.width / 2;
    const pts = this.points;
    const pos = [];
    const uv = [];
    const quad = (a, b, c, d, ua, ub) => {
      // a,b,c,d are [x,y,z] in local space (x=w, z=u)
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      uv.push(ua[0], ua[1], ub[0], ub[1], ub[0], ub[1] + 1, ua[0], ua[1], ub[0], ub[1] + 1, ua[0], ua[1] + 1);
    };
    let arc = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ua, ha] = pts[i];
      const [ub, hb] = pts[i + 1];
      const seg = Math.hypot(ub - ua, hb - ha);
      // top surface
      pos.push(-W, ha, ua, W, ha, ua, W, hb, ub, -W, ha, ua, W, hb, ub, -W, hb, ub);
      const a0 = arc / 2, a1 = (arc + seg) / 2;
      uv.push(0, a0, W, a0, W, a1, 0, a0, W, a1, 0, a1);
      arc += seg;
      // side walls
      if (ha > 0.001 || hb > 0.001) {
        pos.push(W, 0, ua, W, 0, ub, W, hb, ub, W, 0, ua, W, hb, ub, W, ha, ua);
        pos.push(-W, 0, ub, -W, 0, ua, -W, ha, ua, -W, 0, ub, -W, ha, ua, -W, hb, ub);
        uv.push(ua / 2, 0, ub / 2, 0, ub / 2, hb / 2, ua / 2, 0, ub / 2, hb / 2, ua / 2, ha / 2);
        uv.push(ub / 2, 0, ua / 2, 0, ua / 2, ha / 2, ub / 2, 0, ua / 2, ha / 2, ub / 2, hb / 2);
      }
    }
    // top and side faces above were emitted clockwise; flip them to face outwards
    for (let t = 0; t < pos.length; t += 9) {
      for (let k = 0; k < 3; k++) [pos[t + 3 + k], pos[t + 6 + k]] = [pos[t + 6 + k], pos[t + 3 + k]];
    }
    for (let t = 0; t < uv.length; t += 6) {
      for (let k = 0; k < 2; k++) [uv[t + 2 + k], uv[t + 4 + k]] = [uv[t + 4 + k], uv[t + 2 + k]];
    }
    const first = pts[0], last = pts[pts.length - 1];
    if (first[1] > 0.001) {
      const u = first[0], h = first[1];
      pos.push(W, 0, u, -W, 0, u, -W, h, u, W, 0, u, -W, h, u, W, h, u);
      uv.push(0, 0, W, 0, W, h / 2, 0, 0, W, h / 2, 0, h / 2);
    }
    if (last[1] > 0.001) {
      const u = last[0], h = last[1];
      pos.push(-W, 0, u, W, 0, u, W, h, u, -W, 0, u, W, h, u, -W, h, u);
      uv.push(0, 0, W, 0, W, h / 2, 0, 0, W, h / 2, 0, h / 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    const mat = material.clone();
    mat.color = new THREE.Color(this.color);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(this.x, 0, this.z);
    mesh.rotation.y = this.theta;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

function makeConcreteTexture(base = '#9c9a95', lines = true) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  const img = g.getImageData(0, 0, 256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 22;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  if (lines) {
    g.strokeStyle = 'rgba(40,40,40,0.35)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, 254, 254);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeGraffitiTexture(text, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `hsla(${Math.random() * 360},80%,55%,0.5)`;
    g.beginPath();
    g.arc(Math.random() * 512, Math.random() * 128, 20 + Math.random() * 40, 0, Math.PI * 2);
    g.fill();
  }
  g.font = 'italic 900 78px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 10;
  g.strokeStyle = '#111';
  g.strokeText(text, 256, 66);
  g.fillStyle = fg;
  g.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.profiles = [];
    this.rails = [];
    this.spawns = {};
    this.group = new THREE.Group();
    scene.add(this.group);

    this.concrete = new THREE.MeshStandardMaterial({ map: makeConcreteTexture('#b5b1a8'), roughness: 0.92 });
    this.metal = new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.85, roughness: 0.3 });

    this.buildGround();
    this.buildPark();
    this.buildDecor();
  }

  // ---------- height queries ----------
  ground(x, z) {
    let best = { h: 0, gx: 0, gz: 0 };
    for (const p of this.profiles) {
      const s = p.sample(x, z);
      if (s && s.h > best.h) best = s;
    }
    return best;
  }

  heightAt(x, z) {
    return this.ground(x, z).h;
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const g = this.ground(x, z);
    return out.set(-g.gx, 1, -g.gz).normalize();
  }

  // ---------- construction helpers ----------
  addProfile(opts) {
    const p = new Profile(opts);
    this.profiles.push(p);
    this.group.add(p.buildMesh(this.concrete));
    return p;
  }

  addRail(a, b, kind = 'rail', opts = {}) {
    const rail = { a: a.clone(), b: b.clone(), kind, dir: b.clone().sub(a).normalize(), len: a.distanceTo(b) };
    this.rails.push(rail);
    if (opts.visible === false) return rail;
    const r = kind === 'rail' ? 0.035 : 0.025;
    const geo = new THREE.CylinderGeometry(r, r, rail.len, 8);
    const mesh = new THREE.Mesh(geo, this.metal);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), rail.dir);
    mesh.castShadow = true;
    this.group.add(mesh);
    if (kind === 'rail') {
      const posts = Math.max(2, Math.ceil(rail.len / 3) + 1);
      for (let i = 0; i < posts; i++) {
        const t = posts === 1 ? 0.5 : 0.05 + 0.9 * i / (posts - 1);
        const p = a.clone().lerp(b, t);
        const gh = this.heightAt(p.x, p.z);
        const hgt = p.y - gh;
        if (hgt < 0.05) continue;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, hgt, 6), this.metal);
        post.position.set(p.x, gh + hgt / 2, p.z);
        post.castShadow = true;
        this.group.add(post);
      }
    }
    return rail;
  }

  // Box with optional grindable top edges along its length.
  box(x, z, sizeX, sizeZ, h, { color = 0xa9a59c, grind = false, rot = 0 } = {}) {
    const p = this.addProfile({ x: x, z: z, rot, width: sizeX, points: [[-sizeZ / 2, h], [sizeZ / 2, h]], color });
    if (grind) {
      for (const w of [-sizeX / 2, sizeX / 2]) {
        this.addRail(p.toWorld(-sizeZ / 2, w, h), p.toWorld(sizeZ / 2, w, h), 'ledge');
      }
    }
    return p;
  }

  quarterPipe(x, z, rot, { width = 10, radius = 3.6, height = 3, deck = 2.5, color = 0xc4bfb5 } = {}) {
    const dTop = Math.sqrt(radius * radius - (radius - height) * (radius - height));
    const pts = [];
    const N = 22;
    for (let i = 0; i <= N; i++) {
      const u = dTop * i / N;
      pts.push([u, radius - Math.sqrt(radius * radius - u * u)]);
    }
    pts[pts.length - 1][1] = height;
    pts.push([dTop + deck, height]);
    const p = this.addProfile({ x, z, rot, width, points: pts, color });
    this.addRail(p.toWorld(dTop, -width / 2, height), p.toWorld(dTop, width / 2, height), 'coping');
    return p;
  }

  kicker(x, z, rot, { width = 3, length = 2.8, height = 1.2, color = 0xd0c7b5 } = {}) {
    const pts = [];
    const N = 10;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      pts.push([length * t, height * Math.pow(t, 1.6)]);
    }
    return this.addProfile({ x, z, rot, width, points: pts, color });
  }

  // ---------- park ----------
  buildGround() {
    const tex = makeConcreteTexture('#8e8c87');
    tex.repeat.set(42, 42);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(170, 170),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);

    // painted plaza circle
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(6, 6.4, 48),
      new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.55 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.01, -22);
    this.group.add(ring);
  }

  buildPark() {
    // Spawn points: position + heading
    this.spawns.plaza = { pos: new THREE.Vector3(0, 0, -22), heading: 0 };
    this.spawns.half = { pos: new THREE.Vector3(-36, 0, 0), heading: 0 };
    this.spawns.hill = { pos: new THREE.Vector3(55.7, 5.4, -24), heading: -Math.PI / 2 };

    // Main big quarter pipe at the end of the plaza
    this.quarterPipe(0, 46, 0, { width: 18, radius: 4.6, height: 3.8, deck: 3 });

    // Mini halfpipe
    this.quarterPipe(-36, 4, 0, { width: 10, radius: 3.6, height: 3, deck: 2.5 });
    this.quarterPipe(-36, -4, 2, { width: 10, radius: 3.6, height: 3, deck: 2.5 });

    // Funbox with grindable top edges and a flat bar
    const fb = this.addProfile({ x: 0, z: 12, rot: 0, width: 6, points: [[0, 0], [2.4, 0.8], [5.4, 0.8], [7.8, 0]], color: 0xc9bfae });
    for (const w of [-3, 3]) this.addRail(fb.toWorld(2.4, w, 0.8), fb.toWorld(5.4, w, 0.8), 'ledge');
    this.addRail(new THREE.Vector3(1.9, 1.15, 13.6), new THREE.Vector3(1.9, 1.15, 18.2), 'rail');

    // Kickers around the plaza
    this.kicker(-12, 26, 0, { width: 3, length: 2.6, height: 1.0 });
    this.kicker(12, 26, 0, { width: 3, length: 3.2, height: 1.4 });

    // Ledges
    this.box(8, -7, 0.9, 10, 0.45, { grind: true, color: 0x8c8a86 });
    this.box(-8, -7, 0.9, 10, 0.6, { grind: true, color: 0x8c8a86 });
    // Manual pad
    this.box(-8, 22, 2.4, 5, 0.22, { grind: true, color: 0x9f9a90 });
    this.box(20, 8, 2.0, 6, 0.3, { grind: true, color: 0x9f9a90, rot: 1 });

    // Flat rails
    this.addRail(new THREE.Vector3(15, 0.55, -12), new THREE.Vector3(15, 0.55, 4), 'rail');
    this.addRail(new THREE.Vector3(-17, 0.7, -12), new THREE.Vector3(-17, 0.7, 6), 'rail');

    // Bank up to a platform with a 5-stair and a handrail
    const stairPts = [[0, 0], [6, 1.2], [13, 1.2]];
    let u = 13, h = 1.2;
    for (let i = 0; i < 5; i++) {
      h = +(h - 0.24).toFixed(2);
      stairPts.push([u + 0.001, h]);
      u += 0.45;
      stairPts.push([u, h]);
    }
    const stairs = this.addProfile({ x: 42, z: 24, rot: 3, width: 8, points: stairPts, color: 0xa7a299 });
    this.addRail(stairs.toWorld(12.8, 0, 1.93), stairs.toWorld(15.0, 0, 0.47), 'rail');
    // ledges along the platform sides
    for (const w of [-4, 4]) this.addRail(stairs.toWorld(6, w, 1.2), stairs.toWorld(13, w, 1.2), 'ledge');

    // Big hill (drop in from the top for speed) and a kicker at the bottom
    this.addProfile({ x: 40, z: -24, rot: 1, width: 10, points: [[0, 0], [16, 5.5], [23, 5.5]], color: 0xb2ada3 });
    this.kicker(26, -24, 3, { width: 3.5, length: 3.0, height: 1.4 });

    // Planters (obstacles)
    for (const [x, z] of [[-24, -30], [24, -40], [-26, 30], [30, 40]]) {
      this.box(x, z, 3, 3, 0.5, { grind: true, color: 0x7b766d });
      this.tree(x, 0.5, z);
    }

    // Perimeter walls
    const L = 160, T = 1, H = 3.2;
    this.box(0, 80, L, T, H, { color: 0x6f6b64 });
    this.box(0, -80, L, T, H, { color: 0x6f6b64 });
    this.box(80, 0, T, L, H, { color: 0x6f6b64 });
    this.box(-80, 0, T, L, H, { color: 0x6f6b64 });
  }

  tree(x, y, z) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 2, 6), new THREE.MeshStandardMaterial({ color: 0x5a3d2b }));
    trunk.position.set(x, y + 1, z);
    const top = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 0), new THREE.MeshStandardMaterial({ color: 0x3d7a3a, flatShading: true }));
    top.position.set(x, y + 2.6, z);
    trunk.castShadow = top.castShadow = true;
    this.group.add(trunk, top);
  }

  buildDecor() {
    // Graffiti panels on the perimeter walls
    const tags = [['SKATE FAN', '#2b2d42', '#ffcc00'], ['SESSION', '#1d3557', '#f1faee'], ['FLICK IT', '#3a0ca3', '#4cc9f0'], ['BAIL', '#6a040f', '#ffba08']];
    for (let i = 0; i < 8; i++) {
      const [t, bg, fg] = tags[i % tags.length];
      const mat = new THREE.MeshStandardMaterial({ map: makeGraffitiTexture(t, bg, fg), roughness: 0.9 });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), mat);
      const side = i % 4;
      const off = (i < 4 ? -30 : 30);
      if (side === 0) { m.position.set(off, 1.6, 79.45); m.rotation.y = Math.PI; }
      if (side === 1) { m.position.set(off, 1.6, -79.45); }
      if (side === 2) { m.position.set(79.45, 1.6, off); m.rotation.y = -Math.PI / 2; }
      if (side === 3) { m.position.set(-79.45, 1.6, off); m.rotation.y = Math.PI / 2; }
      this.group.add(m);
    }

    // City skyline outside the walls
    const winTexCanvas = document.createElement('canvas');
    winTexCanvas.width = 64; winTexCanvas.height = 128;
    const g = winTexCanvas.getContext('2d');
    g.fillStyle = '#9aa1ad'; g.fillRect(0, 0, 64, 128);
    for (let y = 4; y < 128; y += 12) for (let x = 4; x < 64; x += 12) {
      g.fillStyle = Math.random() < 0.25 ? '#f6e7a1' : '#5d6675';
      g.fillRect(x, y, 7, 8);
    }
    const winTex = new THREE.CanvasTexture(winTexCanvas);
    winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
    winTex.colorSpace = THREE.SRGBColorSpace;
    for (let i = 0; i < 40; i++) {
      const a = i / 40 * Math.PI * 2;
      const r = 125 + Math.random() * 40;
      const w = 10 + Math.random() * 14, d = 10 + Math.random() * 14, hh = 8 + Math.random() * 26;
      const t = winTex.clone();
      t.needsUpdate = true;
      t.repeat.set(w / 8, hh / 16);
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }));
      b.position.set(Math.cos(a) * r, hh / 2, Math.sin(a) * r);
      b.rotation.y = -a;
      this.group.add(b);
    }

    // Light poles
    for (const [x, z] of [[-40, -40], [40, -40], [-40, 40], [40, 40], [0, -60], [0, 64]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 9, 6), this.metal);
      pole.position.set(x, 4.5, z);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.6), new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xfff3c0, emissiveIntensity: 0.6 }));
      lamp.position.set(x, 9, z);
      this.group.add(pole, lamp);
    }
  }

  // Finds the nearest grind segment to point p. Returns {rail, t, dist, point}.
  nearestRail(p) {
    let best = null;
    for (const rail of this.rails) {
      tmpV.copy(p).sub(rail.a);
      let t = tmpV.dot(rail.dir) / rail.len;
      if (t < 0 || t > 1) continue;
      const point = rail.a.clone().addScaledVector(rail.dir, t * rail.len);
      const dh = Math.hypot(point.x - p.x, point.z - p.z);
      const dy = p.y - point.y;
      const score = dh + Math.max(0, -dy) * 2;
      if (!best || score < best.score) best = { rail, t, dh, dy, point, score };
    }
    return best;
  }
}

export function buildSky(scene) {
  const geo = new THREE.SphereGeometry(400, 24, 12);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x3d7fd6) },
      bottom: { value: new THREE.Color(0xf3d9b0) },
    },
    vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vPos;
      void main(){ float h = clamp(normalize(vPos).y * 1.6 + 0.15, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  scene.add(sky);
  return sky;
}
