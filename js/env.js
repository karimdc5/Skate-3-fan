import * as THREE from 'three';

// Port Carverton style scenery: sunny campus plaza with light concrete and
// red brick paver bands, palms, cypress trees, flowering bushes, stucco
// buildings with terracotta roofs, green hills and soft clouds.

const rand = (() => { let s = 1337; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();

function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.repeat.set(repeat, repeat);
  return t;
}

function noise(g, size, amt) {
  const img = g.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * amt;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

// One tile = 16 m: four 4 m concrete slabs with a brick paver band on two edges.
export function plazaTexture() {
  return canvasTex(1024, (g, S) => {
    g.fillStyle = '#bfb7aa';
    g.fillRect(0, 0, S, S);
    noise(g, S, 14);
    // slab joints
    g.strokeStyle = 'rgba(90,80,70,0.35)';
    g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * S / 4, 0); g.lineTo(i * S / 4, S); g.stroke();
      g.beginPath(); g.moveTo(0, i * S / 4); g.lineTo(S, i * S / 4); g.stroke();
    }
    // brick paver bands
    const band = S * 0.07;
    const brick = (x, y, w, h) => {
      g.fillStyle = '#9a4a33';
      g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(60,30,20,0.6)';
      g.lineWidth = 1.5;
      const bw = 18, bh = 9;
      for (let yy = y; yy < y + h; yy += bh) {
        const off = ((yy - y) / bh) % 2 ? bw / 2 : 0;
        g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy); g.stroke();
        for (let xx = x - off; xx < x + w; xx += bw) {
          g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx, Math.min(yy + bh, y + h)); g.stroke();
        }
      }
      // colour variation
      for (let k = 0; k < 220; k++) {
        g.fillStyle = `rgba(${120 + rand() * 60},${50 + rand() * 30},${30 + rand() * 20},0.35)`;
        g.fillRect(x + rand() * w, y + rand() * h, 16, 8);
      }
    };
    brick(0, 0, S, band);
    brick(0, 0, band, S);
  });
}

export function grassTexture() {
  return canvasTex(256, (g, S) => {
    g.fillStyle = '#5f8f3a';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = `hsl(${85 + rand() * 25},${40 + rand() * 20}%,${28 + rand() * 18}%)`;
      g.fillRect(rand() * S, rand() * S, 1.5, 3);
    }
  });
}

function stuccoTexture(base) {
  return canvasTex(256, (g, S) => {
    g.fillStyle = base;
    g.fillRect(0, 0, S, S);
    noise(g, S, 10);
    // two floors of arched windows
    for (let floor = 0; floor < 2; floor++) {
      const y0 = floor * 128;
      for (let i = 0; i < 4; i++) {
        const x = 16 + i * 60, y = y0 + 40, w = 32, h = 60;
        g.fillStyle = '#f4efe6';
        g.fillRect(x - 4, y - 4, w + 8, h + 8);
        g.fillStyle = '#3c4b5a';
        g.beginPath();
        g.moveTo(x, y + h); g.lineTo(x, y + 16);
        g.arc(x + w / 2, y + 16, w / 2, Math.PI, 0);
        g.lineTo(x + w, y + h); g.closePath(); g.fill();
        g.fillStyle = 'rgba(160,200,230,0.35)';
        g.fillRect(x + 3, y + 12, 8, h - 16);
      }
    }
  });
}

// ---------- ground ----------
export function buildGround(group) {
  const plaza = new THREE.Mesh(
    new THREE.PlaneGeometry(162, 162),
    new THREE.MeshStandardMaterial({ map: plazaTexture(), roughness: 0.9 })
  );
  plaza.material.map.repeat.set(162 / 16, 162 / 16);
  plaza.rotation.x = -Math.PI / 2;
  plaza.receiveShadow = true;
  group.add(plaza);

  const grassTex = grassTexture();
  grassTex.repeat.set(200, 200);
  const outer = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 })
  );
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.08;
  outer.receiveShadow = true;
  group.add(outer);

  // sidewalk ring around the park
  const walk = new THREE.Mesh(
    new THREE.PlaneGeometry(190, 190),
    new THREE.MeshStandardMaterial({ color: 0xcfc6b6, roughness: 0.95 })
  );
  walk.rotation.x = -Math.PI / 2;
  walk.position.y = -0.04;
  group.add(walk);

  // grass beds inside the park corners
  const bedMat = new THREE.MeshStandardMaterial({ map: grassTex.clone(), roughness: 1 });
  bedMat.map.repeat.set(8, 8);
  bedMat.map.needsUpdate = true;
  for (const [x, z, w, d] of [[-73, 73, 12, 12], [73, 73, 12, 12], [-73, -73, 12, 12], [73, -73, 12, 12], [0, 77.5, 150, 3], [0, -77.5, 150, 3], [77.5, 0, 3, 140], [-77.5, 0, 3, 140]]) {
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(w, d), bedMat);
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(x, 0.012, z);
    bed.receiveShadow = true;
    group.add(bed);
  }
}

// ---------- palms ----------
function palmParts() {
  // tapered trunk with ring bumps
  const trunk = new THREE.CylinderGeometry(0.16, 0.24, 1, 7, 6, false);
  trunk.translate(0, 0.5, 0);
  const pos = trunk.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const bump = 1 + 0.08 * Math.sin(y * 60);
    pos.setX(i, pos.getX(i) * bump);
    pos.setZ(i, pos.getZ(i) * bump);
  }
  trunk.computeVertexNormals();
  // a drooping frond: a feathery leaf (alpha texture) bent downwards
  const frond = new THREE.PlaneGeometry(1.5, 3.2, 2, 10);
  frond.translate(0, 1.6, 0);
  const fp = frond.attributes.position;
  for (let i = 0; i < fp.count; i++) {
    const y = fp.getY(i);
    const x = fp.getX(i);
    const t = y / 3.2;
    fp.setZ(i, -t * t * 2.0 + Math.abs(x) * 0.35);
  }
  frond.rotateX(-Math.PI / 2 + 0.45);
  frond.computeVertexNormals();
  return { trunk, frond };
}

export function buildPalms(group, spots) {
  const { trunk, frond } = palmParts();
  const trunkMesh = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x8a7258, roughness: 1 }), spots.length);
  const FRONDS = 12;
  const leafTex = canvasTex(128, (g, S) => {
    g.clearRect(0, 0, S, S);
    g.strokeStyle = '#ffffff';
    g.lineCap = 'round';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(S / 2, S); g.lineTo(S / 2, 0); g.stroke();
    g.lineWidth = 4;
    for (let y = S - 6; y > 4; y -= 5) {
      const len = (S / 2 - 4) * Math.sin((y / S) * Math.PI * 0.95 + 0.1);
      g.beginPath(); g.moveTo(S / 2, y); g.lineTo(S / 2 - len, y - 14); g.stroke();
      g.beginPath(); g.moveTo(S / 2, y); g.lineTo(S / 2 + len, y - 14); g.stroke();
    }
  });
  leafTex.colorSpace = THREE.NoColorSpace;
  const frondMesh = new THREE.InstancedMesh(frond, new THREE.MeshStandardMaterial({
    color: 0xffffff, alphaMap: leafTex, alphaTest: 0.4, transparent: false, roughness: 0.9, side: THREE.DoubleSide,
  }), spots.length * FRONDS);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const color = new THREE.Color();
  spots.forEach(([x, y, z, hgt = 7 + rand() * 4], i) => {
    const lean = (rand() - 0.5) * 0.25, leanDir = rand() * Math.PI * 2;
    e.set(Math.cos(leanDir) * lean, 0, Math.sin(leanDir) * lean);
    q.setFromEuler(e);
    m.compose(p.set(x, y, z), q, s.set(1, hgt, 1));
    trunkMesh.setMatrixAt(i, m);
    const top = new THREE.Vector3(0, hgt, 0).applyQuaternion(q).add(new THREE.Vector3(x, y, z));
    for (let k = 0; k < FRONDS; k++) {
      e.set(rand() * 0.3, (k / FRONDS) * Math.PI * 2 + rand() * 0.3, 0, 'YXZ');
      q.setFromEuler(e);
      const sc = 0.8 + rand() * 0.4;
      m.compose(top, q, s.set(sc, sc, sc));
      frondMesh.setMatrixAt(i * FRONDS + k, m);
      frondMesh.setColorAt(i * FRONDS + k, color.setHSL(0.25 + rand() * 0.06, 0.55, 0.28 + rand() * 0.1));
    }
  });
  trunkMesh.castShadow = frondMesh.castShadow = true;
  group.add(trunkMesh, frondMesh);
}

function buildCypress(group, spots) {
  const geo = new THREE.ConeGeometry(0.9, 1, 7);
  geo.translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x2e4f26, roughness: 1, flatShading: true }), spots.length);
  const m = new THREE.Matrix4();
  spots.forEach(([x, z, h], i) => {
    m.makeScale(1, h, 1).setPosition(x, 0, z);
    mesh.setMatrixAt(i, m);
  });
  mesh.castShadow = true;
  group.add(mesh);
}

function buildBushes(group, spots) {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), spots.length);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  spots.forEach(([x, z, r, flower], i) => {
    m.makeScale(r * 1.3, r * 0.8, r * 1.1).setPosition(x, r * 0.45, z);
    mesh.setMatrixAt(i, m);
    if (flower) c.setHSL(0.84 + rand() * 0.06, 0.55, 0.45 + rand() * 0.1);
    else c.setHSL(0.26 + rand() * 0.06, 0.45, 0.22 + rand() * 0.1);
    mesh.setColorAt(i, c);
  });
  mesh.castShadow = true;
  group.add(mesh);
}

// ---------- buildings ----------
const STUCCO = ['#e8dcc4', '#ead2b0', '#f0e6d2', '#e3c7a5', '#efdcc0'];

function building(group, x, z, w, d, h, rotY, color) {
  const g = new THREE.Group();
  const tex = stuccoTexture(color);
  tex.repeat.set(Math.max(1, Math.round(w / 9)), Math.max(1, Math.round(h / 7)));
  const texD = tex.clone();
  texD.repeat.set(Math.max(1, Math.round(d / 9)), Math.max(1, Math.round(h / 7)));
  texD.needsUpdate = true;
  const wallW = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
  const wallD = new THREE.MeshStandardMaterial({ map: texD, roughness: 0.95 });
  const top = new THREE.MeshStandardMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [wallD, wallD, top, top, wallW, wallW]);
  body.position.y = h / 2;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  // terracotta hip roof
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1), new THREE.MeshStandardMaterial({ color: 0xb4532e, roughness: 0.8, flatShading: true }));
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(w * 1.12, Math.min(w, d) * 0.28, d * 1.12);
  roof.position.y = h + roof.scale.y / 2;
  roof.castShadow = true;
  g.add(roof);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  group.add(g);
  return g;
}

// ---------- hills and clouds ----------
function buildHills(group) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x6d8f4c, roughness: 1, flatShading: true });
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + rand() * 0.2;
    const r = 300 + rand() * 60;
    const hill = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), mat);
    hill.scale.set(70 + rand() * 50, 35 + rand() * 40, 60 + rand() * 40);
    hill.position.set(Math.cos(a) * r, -10, Math.sin(a) * r);
    group.add(hill);
  }
}

function buildClouds(group) {
  const tex = canvasTex(256, (g, S) => {
    g.clearRect(0, 0, S, S);
    for (let i = 0; i < 14; i++) {
      const x = 40 + rand() * 176, y = 100 + rand() * 60, r = 25 + rand() * 40;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(255,255,255,0.9)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  });
  for (let i = 0; i < 14; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.85 }));
    const a = rand() * Math.PI * 2, r = 180 + rand() * 160;
    sp.position.set(Math.cos(a) * r, 90 + rand() * 60, Math.sin(a) * r);
    sp.scale.set(120 + rand() * 80, 60 + rand() * 30, 1);
    group.add(sp);
  }
}

// ---------- everything ----------
export function buildScenery(world) {
  const group = world.group;

  // palms along the inside of the walls (set in small planters)
  const inside = [];
  for (let x = -63; x <= 63; x += 14) { inside.push([x, 76.5]); inside.push([x, -76.5]); }
  for (let z = -63; z <= 63; z += 14) { inside.push([76.5, z]); inside.push([-76.5, z]); }
  for (const [x, z] of inside) world.box(x, z, 1.4, 1.4, 0.45, { color: 0xa0503a });
  // outside the park
  const outside = [];
  for (let i = 0; i < 60; i++) {
    const a = rand() * Math.PI * 2, r = 86 + rand() * 30;
    outside.push([Math.cos(a) * r, 0, Math.sin(a) * r]);
  }
  buildPalms(group, [...inside.map(([x, z]) => [x, 0.45, z]), ...outside, ...world.planterSpots.map(([x, z]) => [x, 0.5, z])]);

  // cypress rows and bushes
  const cyp = [];
  for (let i = -8; i <= 8; i++) { cyp.push([i * 10 + 5, 88, 7 + rand() * 4]); cyp.push([88, i * 10 + 5, 7 + rand() * 4]); }
  buildCypress(group, cyp);
  const bushes = [];
  for (let i = -38; i <= 38; i++) {
    const t = i * 2;
    bushes.push([t, 78.6, 0.6 + rand() * 0.4, rand() < 0.35]);
    bushes.push([t, -78.6, 0.6 + rand() * 0.4, rand() < 0.35]);
    bushes.push([78.6, t, 0.6 + rand() * 0.4, rand() < 0.35]);
    bushes.push([-78.6, t, 0.6 + rand() * 0.4, rand() < 0.35]);
  }
  for (let i = 0; i < 120; i++) {
    const a = rand() * Math.PI * 2, r = 84 + rand() * 6;
    bushes.push([Math.cos(a) * r, Math.sin(a) * r, 0.8 + rand() * 0.8, rand() < 0.5]);
  }
  buildBushes(group, bushes);

  // stucco campus buildings around the park
  const ring = [
    [0, 112, 70, 22, 14, 0], [-70, 105, 34, 20, 11, 0.3], [70, 108, 36, 22, 12, -0.3],
    [0, -112, 60, 24, 13, 0], [-72, -104, 30, 22, 10, -0.3], [72, -106, 34, 20, 12, 0.3],
    [112, 0, 22, 60, 13, 0], [108, 60, 20, 30, 11, 0.4], [108, -60, 22, 32, 10, -0.4],
    [-112, 0, 22, 64, 14, 0], [-108, 62, 20, 30, 10, -0.4], [-108, -62, 22, 30, 12, 0.4],
  ];
  ring.forEach(([x, z, w, d, h, r], i) => building(group, x, z, w, d, h, r, STUCCO[i % STUCCO.length]));
  // a few taller ones further back (towers / bell tower vibe)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3, r = 150 + rand() * 30;
    building(group, Math.cos(a) * r, Math.sin(a) * r, 18 + rand() * 12, 18 + rand() * 12, 16 + rand() * 16, -a, STUCCO[i % STUCCO.length]);
  }

  buildHills(group);
  buildClouds(group);

  // street lamps
  const pole = new THREE.MeshStandardMaterial({ color: 0x2f3438, metalness: 0.6, roughness: 0.4 });
  for (const [x, z] of [[-40, -40], [40, -40], [-56, 40], [40, 40], [0, -75.5], [0, 64]]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 6, 6), pole);
    p.position.set(x, 3, z);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.08), pole);
    arm.position.set(x + 0.5, 6, z);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.3), new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xfff3c0, emissiveIntensity: 0.4 }));
    lamp.position.set(x + 1, 5.9, z);
    p.castShadow = true;
    group.add(p, arm, lamp);
  }
}

// Sky dome: deep blue overhead fading to pale haze at the horizon.
export function buildSkyDome(scene) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x2a66c9) },
      mid: { value: new THREE.Color(0x6fa6e3) },
      bottom: { value: new THREE.Color(0xd8e6f0) },
    },
    vertexShader: 'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vPos;
      void main(){ float h = normalize(vPos).y;
        vec3 c = h < 0.12 ? mix(bottom, mid, smoothstep(0.0, 0.12, h)) : mix(mid, top, smoothstep(0.12, 0.6, h));
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), mat);
  scene.add(sky);
  return sky;
}
