import * as THREE from "three";
import { lookDirection } from "./stick-math.js";

const COLORS = {
  red: 0xe23b3b,
  blue: 0x2f6fed,
  yellow: 0xe0b000,
  pink: 0xe85a9b,
};
const TINT = {
  red: 0xc97a72,
  blue: 0x7a96c8,
  yellow: 0xc4b04a,
  pink: 0xc984a8,
};
const FIELD = 1000;
const CENTER = 500;
const CONE_ZONE = 168;
const TEAMS = ["red", "blue", "yellow", "pink"];
const HAIR = [0x2b1b12, 0x6a3b16, 0xc47a2c, 0x1d3557, 0x4a2a5a, 0x3d3d3d];

function isCoarse() {
  return typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)")?.matches;
}

function capDpr() {
  const raw = window.devicePixelRatio || 1;
  return Math.min(raw, isCoarse() ? 1.25 : 1.75);
}

function stashRect(team) {
  if (team === "red") return { x: 0, z: 0 };
  if (team === "blue") return { x: FIELD - CONE_ZONE, z: 0 };
  if (team === "yellow") return { x: 0, z: FIELD - CONE_ZONE };
  return { x: FIELD - CONE_ZONE, z: FIELD - CONE_ZONE };
}

function hairColor(id) {
  let n = 0;
  for (const ch of String(id)) n = (n + ch.charCodeAt(0)) % HAIR.length;
  return HAIR[n];
}

function fieldAngleToYaw(angle) {
  return (angle || 0) + Math.PI / 2;
}

export function createView3d(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !isCoarse(),
    powerPreference: "high-performance",
    alpha: false,
  });
  renderer.setClearColor(0x87b6e0, 1);
  renderer.setPixelRatio(capDpr());
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87b6e0);
  scene.fog = new THREE.Fog(0x9fc5e8, 900, 2200);

  const camera = new THREE.PerspectiveCamera(68, 1, 2, 3200);

  const hemi = new THREE.HemisphereLight(0xfff2d8, 0x3d5c28, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff6e0, 0.8);
  sun.position.set(350, 700, 180);
  scene.add(sun);

  const root = new THREE.Group();
  scene.add(root);
  buildGround(root);
  buildField(root);
  buildCones(root);

  const bagRoot = new THREE.Group();
  root.add(bagRoot);
  const bagPool = [];

  const actors = new Map();
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  let width = 1;
  let height = 1;

  function resize() {
    const w = canvas.clientWidth || window.innerWidth || 1;
    const h = canvas.clientHeight || window.innerHeight || 1;
    width = w;
    height = h;
    renderer.setPixelRatio(capDpr());
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize);

  function takeBag() {
    const mesh = bagPool.pop() || makeBag();
    mesh.visible = true;
    bagRoot.add(mesh);
    return mesh;
  }

  function syncBags(state) {
    const used = [];
    for (const team of TEAMS) {
      const r = stashRect(team);
      const stash = state?.stashes?.[team];
      if (!stash) continue;
      let i = 0;
      for (const color of TEAMS) {
        const n = stash.available?.[color] || 0;
        for (let k = 0; k < n; k++) {
          const col = i % 3;
          const row = Math.floor(i / 3);
          const mesh = takeBag();
          tintBag(mesh, color);
          mesh.position.set(r.x + 40 + col * 44, 6, r.z + 58 + row * 36);
          mesh.rotation.y = 0.15 * i;
          used.push(mesh);
          i += 1;
        }
      }
      const dep = stash.deposited || 0;
      for (let k = 0; k < dep; k++) {
        const mesh = takeBag();
        tintBag(mesh, team);
        mesh.position.set(r.x + 28 + (k % 6) * 20, 5, r.z + CONE_ZONE - 28);
        mesh.scale.setScalar(0.7);
        used.push(mesh);
      }
    }
    for (const child of [...bagRoot.children]) {
      if (!used.includes(child)) {
        child.visible = false;
        child.scale.setScalar(1);
        bagRoot.remove(child);
        bagPool.push(child);
      }
    }
  }

  function syncPlayers(state, meId, now, lookYaw, mode) {
    const seen = new Set();
    for (const p of state?.players || []) {
      seen.add(p.id);
      let actor = actors.get(p.id);
      if (!actor) {
        actor = makeCharacter(p.team, p.id === meId, p.id, p.name);
        actors.set(p.id, actor);
        root.add(actor.group);
      }
      const frozen = (p.frozenUntil || 0) > now;
      actor.group.position.set(p.x, 0, p.y);
      const yaw = p.id === meId && mode !== "classic" ? lookYaw : fieldAngleToYaw(p.angle);
      actor.group.rotation.y = yaw;
      setPose(actor, frozen, p.carrying);
      actor.group.visible = !(p.id === meId && mode === "first");
      actor.nameSprite.visible = mode !== "first" || p.id !== meId;
    }
    for (const [id, actor] of actors) {
      if (!seen.has(id)) {
        root.remove(actor.group);
        actors.delete(id);
      }
    }
  }

  function updateCamera(me, yaw, pitch, mode) {
    if (!me) {
      camera.position.set(CENTER, 420, CENTER + 620);
      camera.lookAt(CENTER, 0, CENTER);
      return;
    }
    const dir = lookDirection(yaw, pitch);
    if (mode === "first") {
      const eye = 30;
      camera.position.set(me.x + dir.x * 4, eye, me.y + dir.z * 4);
      camera.lookAt(me.x + dir.x * 40, eye + dir.y * 40, me.y + dir.z * 40);
      return;
    }
    // Over-the-shoulder third person
    const back = 58;
    const height = 36;
    const side = 14;
    const rightX = Math.cos(yaw);
    const rightZ = Math.sin(yaw);
    camera.position.set(
      me.x - dir.x * back + rightX * side,
      height + Math.max(0, -dir.y * 16),
      me.y - dir.z * back + rightZ * side,
    );
    const aimY = 22 + dir.y * 28;
    camera.lookAt(me.x + dir.x * 30, aimY, me.y + dir.z * 30);
  }

  function frame(state, meId, now, opts = {}) {
    const mode = opts.mode || "third";
    const yaw = opts.yaw || 0;
    const pitch = opts.pitch || 0;
    if (canvas.clientWidth !== width || canvas.clientHeight !== height) resize();
    syncBags(state);
    syncPlayers(state, meId, now, yaw, mode);
    const me = state?.players?.find((p) => p.id === meId);
    updateCamera(me, yaw, pitch, mode);
    renderer.render(scene, camera);
  }

  function project(fieldX, fieldY) {
    tmp.set(fieldX, 22, fieldY);
    tmp2.copy(tmp).applyMatrix4(camera.matrixWorldInverse);
    const behind = tmp2.z > 0;
    tmp.project(camera);
    return {
      x: (tmp.x * 0.5 + 0.5) * width,
      y: (-tmp.y * 0.5 + 0.5) * height,
      ndcX: tmp.x,
      ndcY: tmp.y,
      behind,
    };
  }

  function dispose() {
    window.removeEventListener("resize", resize);
    renderer.dispose();
  }

  return { frame, resize, project, dispose, is3d: true };
}

function buildGround(root) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000),
    new THREE.MeshLambertMaterial({ color: 0x5a8a3e }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.5;
  root.add(ground);
}

function buildField(root) {
  const quarters = [
    [0, 0, TINT.red, 0x7bc45a],
    [CENTER, 0, TINT.blue, 0x6ab34c],
    [0, CENTER, TINT.yellow, 0x7bc45a],
    [CENTER, CENTER, TINT.pink, 0x6ab34c],
  ];
  for (const [x, z, tint, grass] of quarters) {
    const geo = new THREE.PlaneGeometry(CENTER, CENTER, 8, 8);
    const mat = new THREE.MeshLambertMaterial({ color: grass });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x + CENTER / 2, 0, z + CENTER / 2);
    root.add(mesh);
    const wash = new THREE.Mesh(
      new THREE.PlaneGeometry(CENTER - 8, CENTER - 8),
      new THREE.MeshLambertMaterial({ color: tint, transparent: true, opacity: 0.38 }),
    );
    wash.rotation.x = -Math.PI / 2;
    wash.position.set(x + CENTER / 2, 0.3, z + CENTER / 2);
    root.add(wash);
  }

  const lineMat = new THREE.MeshLambertMaterial({ color: 0xf4f7ff });
  function line(x1, z1, x2, z2, width = 6) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, 1.6, width), lineMat);
    mesh.position.set((x1 + x2) / 2, 0.9, (z1 + z2) / 2);
    mesh.rotation.y = Math.atan2(-dz, dx);
    root.add(mesh);
  }
  line(0, 0, FIELD, 0, 8);
  line(FIELD, 0, FIELD, FIELD, 8);
  line(FIELD, FIELD, 0, FIELD, 8);
  line(0, FIELD, 0, 0, 8);
  line(CENTER, 0, CENTER, FIELD, 6);
  line(0, CENTER, FIELD, CENTER, 6);

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(12, 16),
    new THREE.MeshLambertMaterial({ color: 0xf4f7ff }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(CENTER, 1.2, CENTER);
  root.add(disc);

  const labels = [
    ["RED", 250, 250, COLORS.red],
    ["BLUE", 750, 250, COLORS.blue],
    ["YELLOW", 250, 750, COLORS.yellow],
    ["PINK", 750, 750, COLORS.pink],
  ];
  for (const [text, x, z, color] of labels) {
    const sprite = makeTextSprite(text, color, 160);
    sprite.position.set(x, 1.6, z);
    sprite.scale.set(90, 28, 1);
    sprite.material.opacity = 0.35;
    sprite.material.transparent = true;
    root.add(sprite);
  }
}

function buildCones(root) {
  const geo = new THREE.ConeGeometry(8, 22, 7);
  const mat = new THREE.MeshLambertMaterial({ color: 0xe67a2a });
  const stripe = new THREE.MeshLambertMaterial({ color: 0xf4f4f4 });
  const baseMat = new THREE.MeshLambertMaterial({ color: 0x3a2416 });
  for (const team of TEAMS) {
    const r = stashRect(team);
    const corners = [
      [r.x + 10, r.z + 16],
      [r.x + CONE_ZONE - 10, r.z + 16],
      [r.x + 10, r.z + CONE_ZONE - 8],
      [r.x + CONE_ZONE - 10, r.z + CONE_ZONE - 8],
      [r.x + CONE_ZONE / 2, r.z + 16],
      [r.x + CONE_ZONE / 2, r.z + CONE_ZONE - 8],
    ];
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(CONE_ZONE - 12, CONE_ZONE - 12),
      new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.16 }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(r.x + CONE_ZONE / 2, 0.4, r.z + CONE_ZONE / 2);
    root.add(pad);
    for (const [x, z] of corners) {
      const cone = new THREE.Mesh(geo, mat);
      cone.position.set(x, 11, z);
      root.add(cone);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 3, 8), stripe);
      ring.position.set(x, 14, z);
      root.add(ring);
      const base = new THREE.Mesh(new THREE.BoxGeometry(16, 2, 16), baseMat);
      base.position.set(x, 1, z);
      root.add(base);
    }
  }
}

const bagGeo = new THREE.BoxGeometry(18, 10, 22);
const bagMats = {};
function bagMaterial(color) {
  if (!bagMats[color]) {
    bagMats[color] = new THREE.MeshLambertMaterial({ color: COLORS[color] });
  }
  return bagMats[color];
}
function makeBag() {
  return new THREE.Mesh(bagGeo, bagMaterial("red"));
}
function tintBag(mesh, color) {
  mesh.material = bagMaterial(color);
}

function makeCharacter(team, isMe, id, name) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: isMe ? 0xfff0d0 : 0xf3d2b5 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2c3a6a });
  const band = new THREE.MeshLambertMaterial({ color: COLORS[team] });
  const hair = new THREE.MeshLambertMaterial({ color: hairColor(id) });

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(14, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.2;
  group.add(shadow);

  const body = new THREE.Mesh(new THREE.BoxGeometry(16, 22, 10), skin);
  body.position.y = 23;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(8, 8, 6), skin);
  head.position.y = 40;
  group.add(head);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(8.2, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), hair);
  hairCap.position.y = 42;
  hairCap.rotation.x = Math.PI;
  group.add(hairCap);

  function arm(side) {
    const g = new THREE.Group();
    const limb = new THREE.Mesh(new THREE.BoxGeometry(5, 16, 5), skin);
    limb.position.y = -2;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(5.4, 4, 5.4), band);
    stripe.position.y = 2;
    g.add(limb, stripe);
    g.position.set(side * 11, 28, 0);
    group.add(g);
    return g;
  }
  const leftArm = arm(-1);
  const rightArm = arm(1);

  function leg(side) {
    const limb = new THREE.Mesh(new THREE.BoxGeometry(6, 16, 6), pants);
    limb.position.set(side * 4.5, 8, 0);
    group.add(limb);
    return limb;
  }
  const leftLeg = leg(-1);
  const rightLeg = leg(1);

  const bag = makeBag();
  bag.scale.setScalar(0.7);
  bag.position.set(12, 18, 6);
  bag.visible = false;
  group.add(bag);

  const freezeRing = new THREE.Mesh(
    new THREE.TorusGeometry(16, 1.2, 6, 16),
    new THREE.MeshBasicMaterial({ color: 0x7ec8ff, transparent: true, opacity: 0.85 }),
  );
  freezeRing.rotation.x = Math.PI / 2;
  freezeRing.position.y = 2;
  freezeRing.visible = false;
  group.add(freezeRing);

  const nameSprite = makeTextSprite(isMe ? `YOU · ${name || "You"}` : name || "Player", isMe ? 0xffffff : 0x1a2418, 180);
  nameSprite.position.set(0, 56, 0);
  nameSprite.scale.set(48, 14, 1);
  group.add(nameSprite);

  return { group, body, head, leftArm, rightArm, leftLeg, rightLeg, bag, freezeRing, nameSprite, team };
}

function setPose(actor, frozen, carrying) {
  if (frozen) {
    actor.leftLeg.rotation.x = 1.15;
    actor.rightLeg.rotation.x = 1.15;
    actor.leftLeg.position.y = 6;
    actor.rightLeg.position.y = 6;
    actor.body.position.y = 16;
    actor.head.position.y = 33;
    actor.leftArm.rotation.x = 0.6;
    actor.rightArm.rotation.x = 0.6;
    actor.freezeRing.visible = true;
  } else {
    actor.leftLeg.rotation.x = 0;
    actor.rightLeg.rotation.x = 0;
    actor.leftLeg.position.y = 8;
    actor.rightLeg.position.y = 8;
    actor.body.position.y = 23;
    actor.head.position.y = 40;
    actor.leftArm.rotation.x = 0;
    actor.rightArm.rotation.x = 0;
    actor.freezeRing.visible = false;
  }
  if (carrying) {
    actor.bag.visible = true;
    tintBag(actor.bag, carrying.color);
    actor.rightArm.rotation.x = -0.7;
  } else {
    actor.bag.visible = false;
  }
}

function makeTextSprite(text, color, size) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = Math.round(size / 3.2);
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.font = "700 28px Trebuchet MS, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.fillStyle = "#" + color.toString(16).padStart(6, "0");
  ctx.strokeText(text, c.width / 2, c.height / 2);
  ctx.fillText(text, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  return new THREE.Sprite(mat);
}
