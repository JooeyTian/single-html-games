import * as THREE from "three";
import { EffectComposer } from "../vendor/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "../vendor/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "../vendor/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "../vendor/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "../vendor/jsm/postprocessing/OutputPass.js";

/* ============================================================
   星海漂流 · Star Drift
   一艘纸船，在无边的星海里慢慢漂流。
   ============================================================ */

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isCoarse = window.matchMedia("(pointer: coarse)").matches;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const damp = (dt, rate) => 1 - Math.exp(-dt * rate);
const gauss = () => {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

/* ------------------------------------------------------------
   氛围场景：颜色会被平滑插值，切换时整片星海一起呼吸。
   ------------------------------------------------------------ */
const SCENES = [
  {
    name: "蓝色深空",
    top: "#03061a",
    bottom: "#0a1533",
    horizon: "#27447f",
    accent: "#8ec4ff",
    star: "#e8f1ff",
    nebulaA: "#2453c6",
    nebulaB: "#7a5cff",
    tint: "#d3e2ff",
    sea: 0,
    sun: 0,
    bloom: 0.42,
    exposure: 1.04,
  },
  {
    name: "粉紫星云",
    top: "#0f0320",
    bottom: "#2c0d3f",
    horizon: "#83326f",
    accent: "#ffb3d6",
    star: "#ffe9f7",
    nebulaA: "#c0448f",
    nebulaB: "#5e3fd0",
    tint: "#ffd9ef",
    sea: 0,
    sun: 0,
    bloom: 0.48,
    exposure: 1.02,
  },
  {
    name: "晨光海面",
    top: "#123a5e",
    bottom: "#f2a678",
    horizon: "#ffd9a8",
    accent: "#ffd2a0",
    star: "#fff2da",
    nebulaA: "#8a6f9e",
    nebulaB: "#e8a07a",
    tint: "#ffe8cc",
    sea: 1,
    sun: 1,
    bloom: 0.3,
    exposure: 0.96,
  },
];

const colorKeys = ["top", "bottom", "horizon", "accent", "star", "nebulaA", "nebulaB", "tint"];
const scalarKeys = ["sea", "sun", "bloom", "exposure"];

const palette = {};
const target = {};
for (const key of colorKeys) {
  palette[key] = new THREE.Color(SCENES[0][key]);
  target[key] = new THREE.Color(SCENES[0][key]);
}
for (const key of scalarKeys) palette[key] = target[key] = SCENES[0][key];

let sceneIndex = 0;

/* ------------------------------------------------------------
   渲染器
   ------------------------------------------------------------ */
const stage = document.getElementById("stage");
const renderer = new THREE.WebGLRenderer({
  antialias: false,
  alpha: false,
  powerPreference: "high-performance",
  stencil: false,
  preserveDrawingBuffer: true,
});
let pixelRatio = Math.min(window.devicePixelRatio || 1, isCoarse ? 1.6 : 1.85);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x05060f, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = palette.exposure;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);

const canvas = renderer.domElement;
canvas.setAttribute("role", "img");
canvas.setAttribute("aria-label", "星海漫游画面：一艘纸船在星尘中漂流");
canvas.tabIndex = 0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(1.0, 2.5, 9.8);
camera.lookAt(2.0, 0.62, -6);

/* ------------------------------------------------------------
   灯光
   ------------------------------------------------------------ */
const hemi = new THREE.HemisphereLight(0x93b8ff, 0x0a0f22, 0.3);
scene.add(hemi);

const ambientWarm = new THREE.AmbientLight(0xffe2c0, 0.24);
scene.add(ambientWarm);

const sunLight = new THREE.DirectionalLight(0xffe8cc, 1.1);
sunLight.position.set(-26, 16, 8);
scene.add(sunLight);

const fillLight = new THREE.DirectionalLight(0x8fb4ff, 0.32);
fillLight.position.set(24, 6, -30);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffd9b0, 0.45);
rimLight.position.set(-18, 4, -50);
scene.add(rimLight);

/* ------------------------------------------------------------
   程序化贴图
   ------------------------------------------------------------ */
function canvasTexture(size, draw) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const glowTexture = canvasTexture(256, (g, s) => {
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.18, "rgba(255,255,255,0.6)");
  grd.addColorStop(0.46, "rgba(255,255,255,0.16)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
});

const starTexture = canvasTexture(256, (g, s) => {
  const c = s / 2;
  const core = g.createRadialGradient(c, c, 0, c, c, c);
  core.addColorStop(0, "rgba(255,255,255,1)");
  core.addColorStop(0.06, "rgba(255,255,255,0.98)");
  core.addColorStop(0.16, "rgba(220,236,255,0.5)");
  core.addColorStop(0.4, "rgba(190,215,255,0.12)");
  core.addColorStop(1, "rgba(160,190,255,0)");
  g.fillStyle = core;
  g.fillRect(0, 0, s, s);

  g.globalCompositeOperation = "lighter";
  const spike = (w, h) => {
    g.save();
    g.translate(c, c);
    g.scale(w, h);
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, c);
    grd.addColorStop(0, "rgba(255,255,255,0.85)");
    grd.addColorStop(0.25, "rgba(255,255,255,0.28)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.beginPath();
    g.arc(0, 0, c, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  spike(1, 0.028);
  spike(0.028, 1);
  spike(0.62, 0.62);
});

const ringTexture = canvasTexture(256, (g, s) => {
  const c = s / 2;
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.arc(c, c, 105 - i * 3.2, 0, Math.PI * 2);
    g.strokeStyle = `rgba(255,255,255,${0.09 + i * 0.03})`;
    g.lineWidth = 2.4;
    g.stroke();
  }
});

/* 星云：分形噪声生成一次，之后只是一张缓慢流动的贴图 */
function makeNebulaTexture(size = 320) {
  const data = new Uint8Array(size * size * 4);
  const hash = (x, y) => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    return lerp(
      lerp(hash(xi, yi), hash(xi + 1, yi), u),
      lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), u),
      v
    );
  };
  const fbm = (x, y, octaves = 5) => {
    let sum = 0, amp = 0.5;
    for (let i = 0; i < octaves; i++) {
      sum += amp * noise(x, y);
      x = x * 2.03 + 11.7;
      y = y * 2.03 - 5.3;
      amp *= 0.5;
    }
    return sum;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x / size) * 3.4;
      const ny = (y / size) * 3.4;
      const wx = fbm(nx + 2.4, ny + 8.1) - 0.5;
      const wy = fbm(nx + 7.9, ny + 1.3) - 0.5;
      let d = fbm(nx * 1.45 + wx * 1.9, ny * 1.45 + wy * 1.9);
      d = Math.pow(clamp((d - 0.34) / 0.66, 0, 1), 1.55);
      const w = fbm(nx * 2.4 + wx * 2.4 + 4.2, ny * 2.4 + wy * 2.4 + 9.6, 4);
      const dx = x / size - 0.5;
      const dy = y / size - 0.5;
      const fall = Math.pow(clamp(1 - Math.hypot(dx, dy) * 0.94, 0, 1), 2.1);
      const i = (y * size + x) * 4;
      data[i] = Math.round(clamp(d * fall * 1.65, 0, 1) * 255);
      data[i + 1] = Math.round(clamp(Math.pow(w, 1.35) * fall * 1.05, 0, 1) * 255);
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

const nebulaTexture = makeNebulaTexture(isCoarse ? 256 : 320);

/* ------------------------------------------------------------
   天空
   ------------------------------------------------------------ */
const skyMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthTest: false,
  depthWrite: false,
  uniforms: {
    uTop: { value: new THREE.Color() },
    uBottom: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSun: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(-0.42, 0.06, -0.9).normalize() },
    uSunAmount: { value: 0 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec3 vDir;
    uniform vec3 uTop, uBottom, uHorizon, uSun;
    uniform vec3 uSunDir;
    uniform float uSunAmount, uTime;

    void main() {
      vec3 d = normalize(vDir);
      float h = smoothstep(-0.08, 0.7, d.y);
      vec3 col = mix(uBottom, uTop, h);

      // 地平线附近的一条柔光
      float band = exp(-pow((d.y - 0.015) * 5.0, 2.0));
      col += uHorizon * band * (0.12 + uSunAmount * 0.1);

      // 太阳
      float s = max(dot(d, normalize(uSunDir)), 0.0);
      col += uSun * (pow(s, 120.0) * 2.2 + pow(s, 16.0) * 0.22 + pow(s, 3.0) * 0.06) * uSunAmount;

      // 极淡的横向气流，避免纯渐变太死
      float w = sin(d.y * 26.0 + d.x * 4.5 - uTime * 0.03) * 0.5 + 0.5;
      col += uHorizon * w * 0.006 * (1.0 - uSunAmount);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(640, 32, 20), skyMaterial);
sky.frustumCulled = false;
sky.renderOrder = -20;
scene.add(sky);

/* ------------------------------------------------------------
   星云精灵
   ------------------------------------------------------------ */
const nebulaMaterialTemplate = new THREE.ShaderMaterial({
  transparent: true,
  depthTest: false,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: {
    uMap: { value: nebulaTexture },
    uColorA: { value: new THREE.Color() },
    uColorB: { value: new THREE.Color() },
    uOpacity: { value: 0 },
    uTime: { value: 0 },
    uSeed: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform sampler2D uMap;
    uniform vec3 uColorA, uColorB;
    uniform float uOpacity, uTime, uSeed;

    void main() {
      vec2 uv = vUv;
      vec2 flow = vec2(sin(uTime * 0.013 + uSeed) * 0.05, cos(uTime * 0.009 + uSeed * 1.7) * 0.035);
      uv += flow;

      vec4 t = texture2D(uMap, uv);
      float density = t.r;
      float wisp = t.g;
      vec3 col = mix(uColorA, uColorB, clamp(wisp * 1.9, 0.0, 1.0));
      float alpha = density * uOpacity * 1.5;
      gl_FragColor = vec4(col * (0.5 + density * 1.0) * alpha, alpha);
    }
  `,
});

const nebulaGroup = new THREE.Group();
scene.add(nebulaGroup);

const nebulaSprites = [];
const NEBULA_COUNT = isCoarse ? 5 : 9;
for (let i = 0; i < NEBULA_COUNT; i++) {
  const mat = nebulaMaterialTemplate.clone();
  mat.uniforms.uMap.value = nebulaTexture;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  const size = rand(150, 300);
  mesh.scale.set(size, size * rand(0.55, 0.85), 1);
  const z = -420 + i * 62 + rand(-20, 20);
  mesh.position.set(rand(-160, 160), 0.22 * z + rand(-45, 45), z);
  mesh.renderOrder = -5;
  mesh.userData.opacity = rand(0.4, 0.72);
  mesh.userData.seed = rand(0, 10);
  mesh.userData.drift = rand(0.02, 0.055);
  nebulaGroup.add(mesh);
  nebulaSprites.push(mesh);
}

/* ------------------------------------------------------------
   星空
   ------------------------------------------------------------ */
/* ------------------------------------------------------------
    远方的行星：给星海一个可以凝望的焦点
    ------------------------------------------------------------ */
const planetGroup = new THREE.Group();
planetGroup.position.set(185, 78, -470);
scene.add(planetGroup);

const planetMat = new THREE.ShaderMaterial({
  uniforms: {
    uLight: { value: new THREE.Color(0x8ec4ff) },
    uDark: { value: new THREE.Color(0x101a35) },
    uGlow: { value: new THREE.Color(0x8ec4ff) },
  },
  vertexShader: /* glsl */ `
    varying vec3 vN, vV;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal);
      vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec3 vN, vV;
    uniform vec3 uLight, uDark, uGlow;
    void main() {
      vec3 n = normalize(vN);
      float lit = smoothstep(-0.18, 0.62, dot(n, normalize(vec3(-0.62, 0.38, 0.7))));
      float fres = pow(1.0 - max(dot(n, normalize(vV)), 0.0), 3.0);
      float bands = sin(n.y * 26.0 + sin(n.x * 9.0) * 0.9) * 0.5 + 0.5;
      vec3 col = mix(uDark, uLight, lit) * (0.9 + bands * 0.12);
      col += uGlow * fres * (0.14 + lit * 0.22);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
const planet = new THREE.Mesh(new THREE.SphereGeometry(62, 48, 32), planetMat);
planetGroup.add(planet);

const planetRing = new THREE.Mesh(
  new THREE.RingGeometry(1.32, 2.05, 96),
  new THREE.MeshBasicMaterial({
    color: 0x8ec4ff,
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
);
planetRing.rotation.set(1.18, 0.28, 0.2);
planetRing.scale.setScalar(62);
planetGroup.add(planetRing);

const planetGlow = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0x8ec4ff,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.22,
  })
);
planetGlow.scale.set(280, 280, 1);
planetGlow.position.z = -8;
planetGroup.add(planetGlow);

/* 偶尔划过的流星 */
const meteor = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0,
  })
);
meteor.scale.set(16, 0.5, 1);
meteor.renderOrder = 4;
scene.add(meteor);
const meteorFrom = new THREE.Vector3();
const meteorTo = new THREE.Vector3();
let meteorLife = 0;
let meteorTimer = rand(3, 9);

function launchMeteor() {
  const dir = Math.random() < 0.5 ? -1 : 1;
  meteorFrom.set(rand(-120, 45), rand(38, 92), rand(-280, -150));
  meteorTo.set(
    meteorFrom.x + dir * rand(70, 150),
    meteorFrom.y - rand(40, 90),
    meteorFrom.z + rand(30, 80)
  );
  meteor.material.rotation = Math.atan2(meteorTo.y - meteorFrom.y, meteorTo.x - meteorFrom.x);
  meteorLife = 1;
}

function updateMeteor(dt) {
  if (meteorLife <= 0) {
    meteor.material.opacity = 0;
    meteorTimer -= dt;
    if (meteorTimer <= 0) {
      launchMeteor();
      meteorTimer = rand(9, 20);
    }
    return;
  }
  meteorLife -= dt * 0.62;
  const t = clamp(1 - meteorLife, 0, 1);
  meteor.position.lerpVectors(meteorFrom, meteorTo, t);
  meteor.material.opacity = Math.sin(Math.PI * t) * 0.8 * (1 - palette.sea * 0.6);
  meteor.material.color.copy(palette.star);
  if (meteorLife <= 0) meteor.material.opacity = 0;
}

const STAR_COUNT = isCoarse ? 3200 : 5600;

function buildStars() {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(STAR_COUNT * 3);
  const sizes = new Float32Array(STAR_COUNT);
  const phases = new Float32Array(STAR_COUNT);
  const tints = new Float32Array(STAR_COUNT);

  for (let i = 0; i < STAR_COUNT; i++) {
    let x, y, z;
    if (i < STAR_COUNT * 0.42) {
      // 一条斜斜的星带
      x = rand(-300, 300);
      z = rand(-460, 30);
      y = 0.24 * z + 0.16 * x + gauss() * 26;
    } else {
      x = rand(-320, 320);
      z = rand(-460, 30);
      y = rand(-150, 190);
    }
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    sizes[i] = Math.pow(Math.random(), 2.6) * 1.7 + 0.28;
    phases[i] = Math.random();
    tints[i] = Math.random();
  }

  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geo.setAttribute("aTint", new THREE.BufferAttribute(tints, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: pixelRatio },
      uColor: { value: new THREE.Color() },
      uAccent: { value: new THREE.Color() },
      uOpacity: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aPhase;
      attribute float aTint;
      uniform float uTime, uPixelRatio;
      varying float vAlpha;
      varying float vTint;

      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float dist = max(-mv.z, 1.0);
        float tw = 0.6 + 0.4 * sin(uTime * (0.35 + aPhase * 0.9) + aPhase * 42.0);
        float size = aSize * uPixelRatio * (115.0 / dist);
        gl_PointSize = clamp(size * (0.8 + 0.4 * tw), 0.5, 6.0);
        gl_Position = projectionMatrix * mv;

        vAlpha = tw * smoothstep(620.0, 260.0, dist) * smoothstep(0.4, 5.0, dist);
        vTint = aTint;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor, uAccent;
      varying float vAlpha;
      varying float vTint;

      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        float core = smoothstep(0.5, 0.1, d);
        float halo = smoothstep(0.4, 0.0, d);
        float a = (core * 0.92 + halo * 0.1) * vAlpha;
        vec3 col = mix(uColor, uAccent, vTint * vTint);
        gl_FragColor = vec4(col * a * 1.35, a);
      }
    `,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = -2;
  return { points, geo, mat, positions, sizes, phases };
}

const stars = buildStars();
scene.add(stars.points);

/* 近景尘埃：让画面有前后的呼吸感 */
function buildDust() {
  const count = isCoarse ? 140 : 260;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const tints = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = rand(-22, 22);
    positions[i * 3 + 1] = rand(-14, 18);
    positions[i * 3 + 2] = rand(-70, 14);
    sizes[i] = rand(1.2, 4.0);
    phases[i] = Math.random();
    tints[i] = Math.random() * 0.5;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geo.setAttribute("aTint", new THREE.BufferAttribute(tints, 1));

  const mat = stars.mat.clone();
  mat.uniforms.uTime.value = 0;
  mat.uniforms.uPixelRatio.value = pixelRatio;
  mat.uniforms.uColor.value = new THREE.Color("#ffffff");
  mat.uniforms.uAccent.value = new THREE.Color("#cfe2ff");
  mat.depthTest = false;

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 4;
  points.userData.count = count;
  return { points, geo, mat, positions, count };
}

const dust = buildDust();
scene.add(dust.points);

/* ------------------------------------------------------------
   远处的浮岛
   ------------------------------------------------------------ */
const hash3 = (x, y, z) => {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return n - Math.floor(n);
};
const vnoise3 = (x, y, z) => {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const c000 = hash3(xi, yi, zi), c100 = hash3(xi + 1, yi, zi);
  const c010 = hash3(xi, yi + 1, zi), c110 = hash3(xi + 1, yi + 1, zi);
  const c001 = hash3(xi, yi, zi + 1), c101 = hash3(xi + 1, yi, zi + 1);
  const c011 = hash3(xi, yi + 1, zi + 1), c111 = hash3(xi + 1, yi + 1, zi + 1);
  return lerp(
    lerp(lerp(c000, c100, u), lerp(c010, c110, u), v),
    lerp(lerp(c001, c101, u), lerp(c011, c111, u), v),
    w
  );
};
const fbm3 = (x, y, z) => {
  let sum = 0, amp = 0.5;
  for (let i = 0; i < 4; i++) {
    sum += amp * vnoise3(x, y, z);
    x *= 2.1; y *= 2.1; z *= 2.1;
    amp *= 0.5;
  }
  return sum;
};

const rockMaterial = new THREE.MeshStandardMaterial({
  color: 0x232c4a,
  roughness: 0.94,
  metalness: 0.06,
  flatShading: true,
  emissive: 0x141d33,
  emissiveIntensity: 1,
});
const rockMaterialFar = new THREE.MeshStandardMaterial({
  color: 0x1a2138,
  roughness: 1,
  metalness: 0,
  flatShading: true,
});
const crystalMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
const rockBaseColor = new THREE.Color(0x64749f);
const rockFarColor = new THREE.Color(0x3a466a);
const warmWhite = new THREE.Color(0xfff0d8);
const planetLightTmp = new THREE.Color();
const planetDarkTmp = new THREE.Color();
const planetDeep = new THREE.Color(0x101a35);

function makeRock(radius, seed, detail = 2) {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const n =
      fbm3(v.x * 1.7 + seed, v.y * 1.7 - seed * 0.7, v.z * 1.7 + seed * 1.3) -
      0.42;
    const r = radius * (0.82 + n * 0.62);
    v.multiplyScalar(r);
    v.y *= 0.66;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

const islands = [];
const islandRocks = [];
const ISLAND_COUNT = isCoarse ? 4 : 5;
for (let i = 0; i < ISLAND_COUNT; i++) {
  const group = new THREE.Group();
  const radius = rand(1.4, 3.6);
  const detail = i < 3 ? 3 : 2;
  const rock = new THREE.Mesh(makeRock(radius, rand(0, 20), detail), i < 3 ? rockMaterial : rockMaterialFar);
  rock.userData.islandRoot = group;
  islandRocks.push(rock);
  group.add(rock);

  // 岛上几颗发光晶体
  const crystalCount = Math.random() < 0.8 ? Math.floor(rand(3, 6)) : 0;
  for (let c = 0; c < crystalCount; c++) {
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(rand(0.14, 0.34), 0), crystalMaterial);
    const ang = rand(0, Math.PI * 2);
    const rr = radius * rand(0.18, 0.6);
    crystal.position.set(Math.cos(ang) * rr, radius * rand(0.24, 0.42), Math.sin(ang) * rr);
    crystal.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    crystal.userData.base = crystal.position.y;
    crystal.userData.phase = rand(0, 6);
    group.add(crystal);
  }

  const z = -58 - i * 44 + rand(-14, 14);
  const side = i % 2 === 0 ? -1 : 1;
  group.position.set(side * rand(8, 30), rand(-7, 10), z);
  group.rotation.set(rand(-0.2, 0.2), rand(0, 6), rand(-0.15, 0.15));
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0x8ab4ff,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.28,
    })
  );
  halo.scale.set(radius * 2.6, radius * 2.2, 1);
  halo.position.y = -radius * 0.42;
  halo.userData.isHalo = true;
  group.add(halo);
  group.userData.halo = halo;
  group.userData.glow = 0;

  group.userData = {
    spin: rand(-0.06, 0.06),
    bob: rand(0, 6),
    baseY: group.position.y,
  };
  scene.add(group);
  islands.push(group);
}

/* ------------------------------------------------------------
   晨光海面
   ------------------------------------------------------------ */
const seaMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: {
    uDeep: { value: new THREE.Color("#071a2c") },
    uHorizon: { value: new THREE.Color("#ffc79b") },
    uSun: { value: new THREE.Color("#ffd9a8") },
    uTime: { value: 0 },
    uOpacity: { value: 0 },
    uSunAmount: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec3 vWorld;
    varying vec2 vLocal;
    void main() {
      vLocal = position.xz;
      vec4 world = modelMatrix * vec4(position, 1.0);
      vWorld = world.xyz;
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec3 vWorld;
    varying vec2 vLocal;
    uniform vec3 uDeep, uHorizon, uSun;
    uniform float uTime, uOpacity, uSunAmount;

    void main() {
      float d = length(vLocal);
      vec3 col = mix(uDeep, uHorizon, smoothstep(8.0, 300.0, d));

      // 用几层不同频率的波打散规则的横纹
      float n1 = sin(vWorld.x * 0.043 + vWorld.z * 0.071) * 0.5 + 0.5;
      float n2 = sin(vWorld.x * 0.11 - vWorld.z * 0.047 + 2.4) * 0.5 + 0.5;
      float w1 = sin(vWorld.z * 0.31 + vWorld.x * 0.12 + uTime * 0.32 + n1 * 5.0);
      float w2 = sin(vWorld.z * 0.83 - vWorld.x * 0.22 - uTime * 0.55 + n1 * 8.0 + n2 * 3.0);
      float w3 = sin(vWorld.z * 0.12 + vWorld.x * 0.27 + uTime * 0.11 + n2 * 4.0);
      float shimmer = pow(max(w1 * 0.5 + 0.5, 0.0), 10.0) * 0.4
                    + pow(max(w2 * 0.5 + 0.5, 0.0), 16.0) * 0.22
                    + pow(max(w3 * 0.5 + 0.5, 0.0), 5.0) * 0.1;

      // 太阳在水面拉出的一条光路
      float lane = exp(-pow((vWorld.x + vWorld.z * 0.32) * 0.038, 2.0));
      col += uSun * shimmer * (0.03 + lane * 0.55 * uSunAmount);
      col *= 0.82;

      float alpha = uOpacity * (1.0 - smoothstep(240.0, 620.0, d));
      gl_FragColor = vec4(col, alpha);
    }
  `,
});
const sea = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800), seaMaterial);
sea.rotation.x = -Math.PI / 2;
sea.position.y = -0.16;
sea.renderOrder = 1;
sea.userData.visible = false;
scene.add(sea);

/* 太阳的光晕 */
const sunSprite = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xffd2a0,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    opacity: 0,
  })
);
sunSprite.position.set(-268, 16, -560);
sunSprite.scale.set(320, 320, 1);
sunSprite.renderOrder = -1;
scene.add(sunSprite);

/* ------------------------------------------------------------
   纸船
   ------------------------------------------------------------ */
function makeHullGeometry() {
  const SEG = 18;
  const ROWS = 5;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i < SEG; i++) {
    const u = i / (SEG - 1);
    const z = -1.7 + u * 3.05;
    const shape = Math.pow(Math.sin(Math.PI * u), 0.46);
    const w = 0.72 * shape + 0.006;
    const d = 0.3 * Math.pow(Math.sin(Math.PI * u), 0.7) + 0.006;
    const rimY = 0.34 + 0.24 * Math.pow(Math.abs(2 * u - 1), 2.1);
    const rows = [
      [-w, rimY, z],
      [-w * 0.86, -0.02, z],
      [0, -d, z],
      [w * 0.86, -0.02, z],
      [w, rimY, z],
    ];
    for (let r = 0; r < ROWS; r++) {
      positions.push(rows[r][0], rows[r][1], rows[r][2]);
      uvs.push(r / (ROWS - 1), u);
    }
  }

  for (let i = 0; i < SEG - 1; i++) {
    for (let r = 0; r < ROWS - 1; r++) {
      const a = i * ROWS + r;
      const b = a + 1;
      const c = (i + 1) * ROWS + r;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

const boat = new THREE.Group();
const boatScale = 0.7;
boat.scale.setScalar(boatScale);
scene.add(boat);

const paperMaterial = new THREE.MeshStandardMaterial({
  color: 0xefdec0,
  emissive: 0x241b10,
  emissiveIntensity: 1,
  roughness: 0.95,
  metalness: 0,
  flatShading: true,
  side: THREE.DoubleSide,
});
const paperShadeMaterial = new THREE.MeshStandardMaterial({
  color: 0xd6bf98,
  emissive: 0x1d1710,
  emissiveIntensity: 1,
  roughness: 0.97,
  metalness: 0,
  flatShading: true,
  side: THREE.DoubleSide,
});

const hull = new THREE.Mesh(makeHullGeometry(), paperMaterial);
boat.add(hull);

function makeDeckGeometry() {
  const SEG = 18;
  const positions = [];
  const indices = [];
  for (let i = 0; i < SEG; i++) {
    const u = i / (SEG - 1);
    const z = -1.7 + u * 3.05;
    const shape = Math.pow(Math.sin(Math.PI * u), 0.46);
    const w = 0.72 * shape + 0.006;
    const rimY = 0.34 + 0.24 * Math.pow(Math.abs(2 * u - 1), 2.1);
    const ridge = Math.max(rimY + 0.012, 0.34 + 0.2 * Math.pow(Math.sin(Math.PI * u), 0.5));
    positions.push(-w, rimY, z, 0, ridge, z, w, rimY, z);
  }
  for (let i = 0; i < SEG - 1; i++) {
    const a = i * 3;
    const b = (i + 1) * 3;
    indices.push(a, a + 1, b, b, a + 1, b + 1);
    indices.push(a + 1, a + 2, b + 1, b + 1, a + 2, b + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
const deck = new THREE.Mesh(makeDeckGeometry(), paperShadeMaterial);
boat.add(deck);

// 甲板中央的折痕
const ridgePoints = [];
for (let i = 0; i < 60; i++) {
  const u = i / 59;
  const rimY = 0.34 + 0.24 * Math.pow(Math.abs(2 * u - 1), 2.1);
  const ridge = Math.max(rimY + 0.012, 0.34 + 0.2 * Math.pow(Math.sin(Math.PI * u), 0.5));
  ridgePoints.push(new THREE.Vector3(0, ridge + 0.006, -1.7 + u * 3.05));
}
const ridgeLine = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints(ridgePoints),
  new THREE.LineBasicMaterial({ color: 0x9b865f, transparent: true, opacity: 0.5 })
);
boat.add(ridgeLine);

// 折纸的帆：一片带弧度的帆面 + 一根细桅杆
const sailMaterial = new THREE.MeshStandardMaterial({
  color: 0xf9ecd6,
  emissive: 0x2c2115,
  emissiveIntensity: 1,
  roughness: 0.9,
  metalness: 0,
  side: THREE.DoubleSide,
});
const sailShape = new THREE.Shape();
sailShape.moveTo(-0.2, 0.5);
sailShape.lineTo(-0.13, 1.6);
sailShape.quadraticCurveTo(0.5, 1.16, 0.66, 0.53);
sailShape.lineTo(-0.2, 0.5);
const sailGeo = new THREE.ShapeGeometry(sailShape, 28);
{
  const posAttr = sailGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const u = clamp((x + 0.2) / 0.86, 0, 1);
    const v = clamp((y - 0.5) / 1.1, 0, 1);
    posAttr.setZ(i, Math.sin(Math.PI * u) * Math.sin(Math.PI * v) * 0.13);
  }
  sailGeo.computeVertexNormals();
}
const sail = new THREE.Mesh(sailGeo, sailMaterial);
sail.position.z = 0.02;
boat.add(sail);

const mast = new THREE.Mesh(
  new THREE.CylinderGeometry(0.012, 0.017, 1.16, 6),
  new THREE.MeshStandardMaterial({ color: 0x6a5840, roughness: 0.9, flatShading: true })
);
mast.position.set(-0.165, 1.08, 0.0);
boat.add(mast);

// 船沿的一条细线，强调折纸边缘
const rimPoints = [];
for (let i = 0; i < 40; i++) {
  const u = i / 39;
  const z = -1.7 + u * 3.05;
  const w = 0.72 * Math.pow(Math.sin(Math.PI * u), 0.46) + 0.006;
  const rimY = 0.34 + 0.24 * Math.pow(Math.abs(2 * u - 1), 2.1);
  rimPoints.push(new THREE.Vector3(-w, rimY, z));
}
for (let i = 39; i >= 0; i--) {
  const u = i / 39;
  const z = -1.7 + u * 3.05;
  const w = 0.72 * Math.pow(Math.sin(Math.PI * u), 0.46) + 0.006;
  const rimY = 0.34 + 0.24 * Math.pow(Math.abs(2 * u - 1), 2.1);
  rimPoints.push(new THREE.Vector3(w, rimY, z));
}
const rim = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints(rimPoints),
  new THREE.LineBasicMaterial({ color: 0xfff6e2, transparent: true, opacity: 0.28 })
);
boat.add(rim);

// 船尾的小灯
const lantern = new THREE.Mesh(
  new THREE.SphereGeometry(0.042, 12, 10),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc37a).multiplyScalar(1.5) })
);
lantern.position.set(0, 0.52, 1.12);
boat.add(lantern);

const lanternLight = new THREE.PointLight(0xffb266, 0.055, 2.2, 2);
lanternLight.position.copy(lantern.position);
boat.add(lanternLight);

const boatGlow = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xffc48a,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.0,
  })
);
boatGlow.position.set(0, -0.24, 0.1);
boatGlow.scale.set(1.7, 2.6, 1);
boat.add(boatGlow);

const lanternGlow = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xffc37a,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.24,
  })
);
lanternGlow.position.copy(lantern.position);
lanternGlow.scale.set(0.15, 0.15, 1);
boat.add(lanternGlow);

boat.position.set(0, -0.08, 0);
boat.rotation.y = 0.62;

/* ------------------------------------------------------------
   船后的光轨
   ------------------------------------------------------------ */
const MAX_WAKE = 76;
const wake = [];
const wakeGeo = new THREE.BufferGeometry();
const wakePositions = new Float32Array(MAX_WAKE * 2 * 3);
const wakeUvs = new Float32Array(MAX_WAKE * 2 * 2);
{
  const indices = [];
  for (let i = 0; i < MAX_WAKE - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    indices.push(a, c, b, b, c, d);
  }
  wakeGeo.setIndex(indices);
  for (let i = 0; i < MAX_WAKE; i++) {
    wakeUvs[i * 4] = 0;
    wakeUvs[i * 4 + 1] = i / (MAX_WAKE - 1);
    wakeUvs[i * 4 + 2] = 1;
    wakeUvs[i * 4 + 3] = i / (MAX_WAKE - 1);
  }
  wakeGeo.setAttribute("position", new THREE.BufferAttribute(wakePositions, 3));
  wakeGeo.setAttribute("uv", new THREE.BufferAttribute(wakeUvs, 2));
  wakeGeo.setDrawRange(0, 0);
}
const wakeMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  uniforms: {
    uColor: { value: new THREE.Color() },
    uOpacity: { value: 0.16 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform vec3 uColor;
    uniform float uOpacity;
    void main() {
      float edge = smoothstep(0.0, 0.34, vUv.x) * smoothstep(1.0, 0.66, vUv.x);
      float tail = pow(1.0 - vUv.y, 3.2);
      float a = edge * tail * uOpacity;
      gl_FragColor = vec4(uColor * (0.5 + edge * 0.9) * a, a);
    }
  `,
});
const wakeMesh = new THREE.Mesh(wakeGeo, wakeMaterial);
wakeMesh.frustumCulled = false;
wakeMesh.renderOrder = 2;
scene.add(wakeMesh);

/* ------------------------------------------------------------
   可点击的星辰
   ------------------------------------------------------------ */
const clickableStars = [];
const CLICK_STAR_COUNT = isCoarse ? 16 : 22;
const starWhite = new THREE.Color(1, 1, 1);

for (let i = 0; i < CLICK_STAR_COUNT; i++) {
  const tint = Math.random();
  const material = new THREE.SpriteMaterial({
    map: starTexture,
    color: new THREE.Color().lerpColors(starWhite, new THREE.Color("#bcd8ff"), tint),
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.7,
  });
  const sprite = new THREE.Sprite(material);
  const scale = rand(0.45, 1.05);
  sprite.scale.setScalar(scale);
  sprite.position.set(rand(-17, 17), rand(-3.2, 8.5), rand(-70, -12));
  sprite.renderOrder = 3;
  sprite.userData = {
    baseScale: scale,
    tint,
    lit: false,
    pulse: 0,
    phase: rand(0, 6.28),
    speed: rand(4.2, 7.4),
    drift: rand(0.12, 0.4),
  };
  scene.add(sprite);
  clickableStars.push(sprite);
}

// 点击后的光环
const rings = [];
for (let i = 0; i < 8; i++) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: ringTexture,
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    })
  );
  sprite.visible = false;
  sprite.renderOrder = 5;
  scene.add(sprite);
  rings.push({ sprite, life: 0, scale: 1 });
}

// 星火粒子
/* 连点星辰，慢慢连成一幅星座 */
const CONSTELLATION_MAX = 6;
const constellationStars = [];
const constellationGeo = new THREE.BufferGeometry();
const constellationPositions = new Float32Array(CONSTELLATION_MAX * 2 * 3);
const constellationAttr = new THREE.BufferAttribute(constellationPositions, 3);
constellationAttr.setUsage(THREE.DynamicDrawUsage);
constellationGeo.setAttribute("position", constellationAttr);
constellationGeo.setDrawRange(0, 0);
const constellationMat = new THREE.LineBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending,
  depthTest: false,
  depthWrite: false,
});
const constellationLines = new THREE.LineSegments(constellationGeo, constellationMat);
constellationLines.frustumCulled = false;
constellationLines.renderOrder = 7;
scene.add(constellationLines);
let constellationLife = 0;
let constellationSparkle = 0;

function addToConstellation(star) {
  const idx = constellationStars.indexOf(star);
  if (idx >= 0) constellationStars.splice(idx, 1);
  constellationStars.push(star);
  if (constellationStars.length > CONSTELLATION_MAX) constellationStars.shift();
  constellationLife = 1;
  constellationSparkle = 1;
  if (constellationStars.length === CONSTELLATION_MAX) {
    for (const s of constellationStars) spawnSparks(s.position, 5);
    audio.chime(0.5);
    audio.note(PENTATONIC[7] * 0.5, 0, 0.4);
  }
}

function updateConstellation(dt) {
  constellationLife = Math.max(0, constellationLife - dt * 0.07);
  constellationSparkle = Math.max(0, constellationSparkle - dt * 0.8);
  for (let i = constellationStars.length - 1; i >= 0; i--) {
    if (constellationStars[i].position.z > 13) constellationStars.splice(i, 1);
  }
  let k = 0;
  for (let i = 1; i < constellationStars.length; i++) {
    const a = constellationStars[i].position;
    let nearest = null;
    let min = Infinity;
    for (let j = 0; j < i; j++) {
      const d = a.distanceTo(constellationStars[j].position);
      if (d < min) {
        min = d;
        nearest = constellationStars[j].position;
      }
    }
    if (!nearest || min > 38) continue;
    constellationPositions[k++] = a.x;
    constellationPositions[k++] = a.y;
    constellationPositions[k++] = a.z;
    constellationPositions[k++] = nearest.x;
    constellationPositions[k++] = nearest.y;
    constellationPositions[k++] = nearest.z;
  }
  constellationGeo.setDrawRange(0, k / 3);
  if (k) constellationAttr.needsUpdate = true;
  constellationMat.color.copy(palette.star).lerp(palette.accent, 0.45);
  constellationMat.opacity = constellationLife * (0.24 + constellationSparkle * 0.26);
}

const MAX_SPARKS = 220;
const sparkGeo = new THREE.BufferGeometry();
const sparkPositions = new Float32Array(MAX_SPARKS * 3);
const sparkSizes = new Float32Array(MAX_SPARKS);
const sparkAlphas = new Float32Array(MAX_SPARKS);
sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPositions, 3));
sparkGeo.setAttribute("aSize", new THREE.BufferAttribute(sparkSizes, 1));
sparkGeo.setAttribute("aAlpha", new THREE.BufferAttribute(sparkAlphas, 1));
const sparkMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  depthTest: false,
  blending: THREE.AdditiveBlending,
  uniforms: {
    uColor: { value: new THREE.Color() },
    uPixelRatio: { value: pixelRatio },
  },
  vertexShader: /* glsl */ `
    attribute float aSize;
    attribute float aAlpha;
    uniform float uPixelRatio;
    varying float vAlpha;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = aSize * uPixelRatio * (120.0 / max(-mv.z, 1.0));
      vAlpha = aAlpha;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    varying float vAlpha;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float a = smoothstep(0.5, 0.0, d) * vAlpha;
      gl_FragColor = vec4(uColor * a * 2.0, a);
    }
  `,
});
const sparks = new THREE.Points(sparkGeo, sparkMat);
sparks.frustumCulled = false;
sparks.renderOrder = 6;
scene.add(sparks);
const sparkState = Array.from({ length: MAX_SPARKS }, () => ({ life: 0, vx: 0, vy: 0, vz: 0 }));
let sparkCursor = 0;

function spawnSparks(position, count = 16) {
  for (let i = 0; i < count; i++) {
    const idx = sparkCursor++ % MAX_SPARKS;
    const s = sparkState[idx];
    s.life = rand(0.6, 1.4);
    s.max = s.life;
    const dir = new THREE.Vector3(gauss(), gauss(), gauss()).normalize().multiplyScalar(rand(0.8, 3.2));
    s.vx = dir.x;
    s.vy = dir.y;
    s.vz = dir.z;
    sparkPositions[idx * 3] = position.x;
    sparkPositions[idx * 3 + 1] = position.y;
    sparkPositions[idx * 3 + 2] = position.z;
    sparkSizes[idx] = rand(1.5, 4.2);
    sparkAlphas[idx] = 1;
  }
  sparkGeo.attributes.position.needsUpdate = true;
  sparkGeo.attributes.aSize.needsUpdate = true;
  sparkGeo.attributes.aAlpha.needsUpdate = true;
}

/* ------------------------------------------------------------
   声音：一盏持续的 ambient，加上点星时的五声钟音
   ------------------------------------------------------------ */
const PENTATONIC = [293.66, 329.63, 369.99, 440.0, 493.88, 587.33, 659.25, 739.99, 880.0];
const PAD_CHORDS = [
  [55.0, 82.41, 110.0, 164.81],
  [49.0, 73.42, 98.0, 146.83],
  [65.41, 98.0, 130.81, 196.0],
];

const audio = {
  ctx: null,
  enabled: true,
  started: false,
  master: null,
  padGain: null,
  reverb: null,
  voices: [],
  noteIndex: 0,

  makeImpulse(ctx, seconds = 3.6, decay = 2.4) {
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const buffer = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const t = i / length;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return buffer;
  },

  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;

    const ctx = new Ctx();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 24;
    compressor.ratio.value = 2.5;
    master.connect(compressor);
    compressor.connect(ctx.destination);
    this.master = master;

    const convolver = ctx.createConvolver();
    convolver.buffer = this.makeImpulse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.6;
    convolver.connect(wet);
    wet.connect(master);
    this.reverb = convolver;

    const padGain = ctx.createGain();
    padGain.gain.value = 0.16;
    padGain.connect(master);
    const padSend = ctx.createGain();
    padSend.gain.value = 0.75;
    padGain.connect(padSend);
    padSend.connect(convolver);
    this.padGain = padGain;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 760;
    filter.Q.value = 0.35;
    filter.connect(padGain);

    const padLevels = [0.5, 0.3, 0.2, 0.1];
    for (let i = 0; i < 4; i++) {
      const osc = ctx.createOscillator();
      osc.type = i < 2 ? "sine" : "triangle";
      osc.frequency.value = PAD_CHORDS[0][i];
      osc.detune.value = (i - 1.5) * 3.5;
      const gain = ctx.createGain();
      gain.gain.value = padLevels[i];
      osc.connect(gain);
      gain.connect(filter);
      osc.start();
      this.voices.push({ osc, gain, level: padLevels[i] });
    }

    // 缓慢起伏的滤波，像呼吸
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.045;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 240;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    this.started = true;
    this.setEnabled(this.enabled, 0.01);
    this.setScene(sceneIndex, 0.5);
  },

  setEnabled(on, fade = 1.4) {
    this.enabled = on;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(on ? 0.55 : 0.0001, t, fade);
    if (on && this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  },

  setScene(index, time = 2.8) {
    this.scene = index;
    if (!this.ctx) return;
    const chord = PAD_CHORDS[index] || PAD_CHORDS[0];
    const t = this.ctx.currentTime;
    this.voices.forEach((v, i) => {
      v.osc.frequency.setTargetAtTime(chord[i], t, time * 0.5);
    });
  },

  note(freq, pan = 0, velocity = 1) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01;

    const panner = ctx.createStereoPanner();
    panner.pan.value = clamp(pan, -0.85, 0.85);

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(3400, t);
    lp.frequency.exponentialRampToValueAtTime(820, t + 2.6);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.085 * velocity, t + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);

    const partials = [
      [1, 1],
      [2.006, 0.2],
      [3.01, 0.075],
    ];
    for (const [mult, level] of partials) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq * mult;
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g);
      g.connect(lp);
      osc.start(t);
      osc.stop(t + 3.3);
    }

    lp.connect(env);
    env.connect(panner);
    panner.connect(this.master);

    const send = ctx.createGain();
    send.gain.value = 0.9;
    panner.connect(send);
    send.connect(this.reverb);
  },

  chime(velocity = 1) {
    const freq = PENTATONIC[this.noteIndex % PENTATONIC.length] * (this.noteIndex % 7 === 6 ? 0.5 : 1);
    this.noteIndex++;
    this.note(freq, rand(-0.5, 0.5), velocity);
  },
};

/* ------------------------------------------------------------
   后期：泛光 + 暗角 + 颗粒 + 色调
   ------------------------------------------------------------ */
const composerTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
  type: THREE.HalfFloatType,
  samples: 4,
});
const composer = new EffectComposer(renderer, composerTarget);
composer.addPass(new RenderPass(scene, camera));

const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.42,
  0.55,
  1.15
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const gradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uFade: { value: 0 },
    uTint: { value: new THREE.Color("#d3e2ff") },
    uVignette: { value: 0.42 },
    uGrain: { value: 0.035 },
    uAberration: { value: 0.0016 },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uTime, uFade, uVignette, uGrain, uAberration;
    uniform vec3 uTint;
    uniform vec2 uResolution;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * uAberration * (0.4 + r2 * 2.6);

      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;

      col *= mix(vec3(1.0), uTint, 0.28);

      float vig = smoothstep(0.92, 0.18, r2 * 1.75);
      col *= mix(1.0 - uVignette, 1.0, vig);

      float n = hash(vUv * uResolution + fract(uTime) * 137.0) - 0.5;
      col += n * uGrain * (0.35 + col * 0.9);

      col *= uFade;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
const grade = new ShaderPass(gradeShader);
composer.addPass(grade);

/* ------------------------------------------------------------
   航行状态
   ------------------------------------------------------------ */
const state = {
  boatX: 0,
  boatVX: 0,
  targetX: 0,
  dragging: false,
  dragStartX: 0,
  dragStartY: 0,
  dragStartTarget: 0,
  dragMoved: false,
  dragTime: 0,
  dragId: null,
  idle: 0,
  time: 0,
  pointerX: 0,
  pointerY: 0,
  pointerNX: 0,
  pointerNY: 0,
  hover: false,
  targetFov: 46,
  lanternBoost: 0,
  fade: 0.001,
  frameAvg: 16.7,
  frames: 0,
  qualityReduced: false,
  lookAt: new THREE.Vector3(0, 0.55, -7),
};

const boardTarget = new THREE.Vector3(0, 0.55, -7);
const cameraTarget = new THREE.Vector3();
// 宽屏与竖屏用不同的取景：竖屏时船居中并拉远，避免被裁切
const frame = { camZ: 9.7, camY: 2.28, lookX: 1.95, followCam: 0.55, followLook: 0.28 };
const wakeCursor = { armed: -1 };
let last = performance.now();

/* ------------------------------------------------------------
   拾取与绽放
   ------------------------------------------------------------ */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function pickStar(event) {
  const rect = canvas.getBoundingClientRect();
  ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(clickableStars, false)[0];
  if (hit) {
    bloomStar(hit.object);
    return true;
  }
  return false;
}

const _v = new THREE.Vector3();

function bloomStar(star) {
  const data = star.userData;
  data.lit = true;
  data.pulse = 1;
  spawnSparks(star.position, 18);
  spawnSparks(star.position, 8);

  const ring = rings.find((r) => r.life <= 0) || rings[0];
  ring.life = 1;
  ring.sprite.visible = true;
  ring.sprite.position.copy(star.position);
  ring.sprite.material.color.copy(palette.accent).multiplyScalar(1.6);
  ring.scale = data.baseScale;
  ring.sprite.scale.setScalar(data.baseScale * 1.4);

  const projected = _v.copy(star.position).project(camera);
  const pan = clamp(projected.x, -1, 1) * 0.75;

  audio.init();
  audio.chime(0.9);
  audio.note(PENTATONIC[Math.floor(Math.random() * 5) + 4] * 0.5, pan, 0.35);

  star.material.opacity = 1;
  addToConstellation(star);
}

function spawnRippleAt(event) {
  const rect = canvas.getBoundingClientRect();
  ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const point = raycaster.ray.at(rand(18, 32), new THREE.Vector3());
  const ring = rings.find((r) => r.life <= 0);
  if (!ring) return;
  ring.life = 0.75;
  ring.sprite.visible = true;
  ring.sprite.position.copy(point);
  ring.sprite.material.color.copy(palette.accent).multiplyScalar(0.8);
  ring.scale = 0.8;
  ring.sprite.scale.setScalar(0.8);
  audio.init();
  audio.note(PENTATONIC[0] * 2, clamp(point.x / 20, -0.6, 0.6), 0.22);
}

/* 纸船与浮岛也可以轻触 */
const boatMeshes = [hull, deck, sail, mast, lantern];

function celebrateBoat() {
  state.lanternBoost = 1;
  state.boatVX += rand(-0.35, 0.35);
  const p = _v.set(boat.position.x, boat.position.y + 0.6, boat.position.z).clone();
  spawnSparks(p, 22);
  const ring = rings.find((r) => r.life <= 0) || rings[0];
  ring.life = 0.9;
  ring.sprite.visible = true;
  ring.sprite.position.copy(p);
  ring.sprite.material.color.copy(palette.accent).multiplyScalar(1.4);
  ring.scale = 1.1;
  ring.sprite.scale.setScalar(1.4);
  audio.init();
  audio.chime(0.75);
  audio.note(PENTATONIC[2] * 0.5, 0, 0.3);
}

function celebrateIsland(island) {
  if (!island) return;
  island.userData.glow = 1;
  const p = island.position.clone();
  p.y += 0.6;
  spawnSparks(p, 24);
  const ring = rings.find((r) => r.life <= 0) || rings[0];
  ring.life = 1;
  ring.sprite.visible = true;
  ring.sprite.position.copy(p);
  ring.sprite.material.color.copy(palette.accent).multiplyScalar(1.3);
  ring.scale = 1.6;
  ring.sprite.scale.setScalar(2.2);
  audio.init();
  audio.chime(0.55);
  audio.note(PENTATONIC[4] * 0.5, clamp(p.x / 30, -0.7, 0.7), 0.34);
}

function pickWorld(event) {
  const rect = canvas.getBoundingClientRect();
  ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);

  const starHit = raycaster.intersectObjects(clickableStars, false)[0];
  if (starHit) {
    bloomStar(starHit.object);
    return true;
  }
  const boatHit = raycaster.intersectObjects(boatMeshes, false)[0];
  if (boatHit) {
    celebrateBoat();
    return true;
  }
  const islandHit = raycaster.intersectObjects(islandRocks, false)[0];
  if (islandHit) {
    celebrateIsland(islandHit.object.userData.islandRoot);
    return true;
  }
  spawnRippleAt(event);
  return false;
}

const trailPoint = new THREE.Vector3();
let lastTrail = 0;
function pointerWorldPoint(event, distance) {
  const rect = canvas.getBoundingClientRect();
  ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray.at(distance, trailPoint);
}

/* ------------------------------------------------------------
   输入
   ------------------------------------------------------------ */
const hint = document.getElementById("hint");
let hintHidden = false;
function hideHint() {
  if (hintHidden) return;
  hintHidden = true;
  hint.classList.add("gone");
}

function updatePointer(event) {
  state.pointerX = event.clientX;
  state.pointerY = event.clientY;
  state.pointerNX = (event.clientX / window.innerWidth) * 2 - 1;
  state.pointerNY = -((event.clientY / window.innerHeight) * 2 - 1);
}

canvas.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  audio.init();

  state.dragging = true;
  state.dragId = event.pointerId;
  state.dragStartX = event.clientX;
  state.dragStartY = event.clientY;
  state.dragStartTarget = state.targetX;
  state.dragMoved = false;
  state.dragTime = performance.now();
  state.idle = 0;
  state.hover = false;
  canvas.classList.remove("can-pick");
  canvas.classList.add("is-dragging");
  canvas.setPointerCapture(event.pointerId);
  updatePointer(event);
  hideHint();
});

canvas.addEventListener("pointermove", (event) => {
  updatePointer(event);
  if (state.dragging && event.pointerId === state.dragId) {
    const dx = event.clientX - state.dragStartX;
    const dy = event.clientY - state.dragStartY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) state.dragMoved = true;
    state.targetX = clamp(state.dragStartTarget + (dx / window.innerWidth) * 9.5, -6.5, 6.5);
    state.idle = 0;
    if (state.time - lastTrail > 0.07) {
      lastTrail = state.time;
      spawnSparks(pointerWorldPoint(event, rand(14, 26)), 2);
    }
    return;
  }
  if (event.pointerType === "mouse" && !state.dragging) {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(clickableStars, false).length > 0;
    if (hit !== state.hover) {
      state.hover = hit;
      canvas.classList.toggle("can-pick", hit);
    }
  }
});

function endDrag(event) {
  if (!state.dragging || event.pointerId !== state.dragId) return;
  state.dragging = false;
  state.dragId = null;
  canvas.classList.remove("is-dragging");
  if (!state.dragMoved && performance.now() - state.dragTime < 650) {
    pickWorld(event);
    hideHint();
  }
  if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
}

canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", (event) => {
  if (event.pointerId !== state.dragId) return;
  state.dragging = false;
  state.dragId = null;
  canvas.classList.remove("is-dragging");
});

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  state.targetFov = clamp(state.targetFov + event.deltaY * 0.018, 30, 72);
  hideHint();
}, { passive: false });

const steerKeys = new Set();
window.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (["Digit1", "Digit2", "Digit3"].includes(event.code)) {
    setScene(Number(event.code.slice(-1)) - 1);
    hideHint();
    audio.init();
    return;
  }
  const keys = ["ArrowLeft", "ArrowRight", "KeyA", "KeyD"];
  if (!keys.includes(event.code)) return;
  event.preventDefault();
  steerKeys.add(event.code);
  state.idle = 0;
  hideHint();
  audio.init();
});
window.addEventListener("keyup", (event) => steerKeys.delete(event.code));
window.addEventListener("blur", () => steerKeys.clear());

/* ------------------------------------------------------------
   场景切换与界面
   ------------------------------------------------------------ */
const sceneButtons = [...document.querySelectorAll(".scene")];
const soundButton = document.getElementById("sound");
const captureButton = document.getElementById("capture");

function setScene(index, announceAudio = true) {
  sceneIndex = ((index % SCENES.length) + SCENES.length) % SCENES.length;
  const preset = SCENES[sceneIndex];
  for (const key of colorKeys) target[key].set(preset[key]);
  for (const key of scalarKeys) target[key] = preset[key];
  sceneButtons.forEach((btn) => btn.setAttribute("aria-pressed", String(Number(btn.dataset.scene) === sceneIndex)));
  if (announceAudio && audio.started) {
    audio.setScene(sceneIndex);
    audio.note(PENTATONIC[sceneIndex + 2] * 0.5, 0, 0.32);
    window.setTimeout(() => audio.note(PENTATONIC[sceneIndex + 4] * 0.5, 0.15, 0.22), 340);
  }
}

sceneButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    setScene(Number(btn.dataset.scene));
    hideHint();
    audio.init();
  });
});

soundButton.addEventListener("click", () => {
  audio.init();
  const on = soundButton.getAttribute("aria-pressed") !== "true";
  soundButton.setAttribute("aria-pressed", String(on));
  audio.setEnabled(on);
});

captureButton.addEventListener("click", () => {
  composer.render();
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  link.download = `星海漂流-${stamp}.png`;
  link.href = renderer.domElement.toDataURL("image/png");
  link.click();
  hideHint();
});

/* ------------------------------------------------------------
   尺寸
   ------------------------------------------------------------ */
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const wide = clamp((w / h - 0.6) / 1.0, 0, 1);
  frame.camZ = 9.7 + (1 - wide) * 7.2;
  frame.camY = 2.28 + (1 - wide) * 0.4;
  frame.lookX = 1.95 * wide;
  frame.followCam = 0.55 * (0.35 + 0.65 * wide);
  frame.followLook = 0.28 * (0.35 + 0.65 * wide);
  if (!frame.ready) {
    camera.position.set(1.0, frame.camY, frame.camZ);
    state.lookAt.set(frame.lookX, 0.78, -7);
    frame.ready = true;
  }
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h);
  composer.setSize(w, h);
  grade.uniforms.uResolution.value.set(w * pixelRatio, h * pixelRatio);
  stars.mat.uniforms.uPixelRatio.value = pixelRatio;
  dust.mat.uniforms.uPixelRatio.value = pixelRatio;
  sparkMat.uniforms.uPixelRatio.value = pixelRatio;
}
window.addEventListener("resize", resize);

/* ------------------------------------------------------------
   每帧
   ------------------------------------------------------------ */
function updateBoat(dt) {
  state.idle += dt;

  const keyboard = (steerKeys.has("ArrowRight") || steerKeys.has("KeyD") ? 1 : 0) -
    (steerKeys.has("ArrowLeft") || steerKeys.has("KeyA") ? 1 : 0);
  if (keyboard) {
    state.targetX = clamp(state.targetX + keyboard * dt * 4.2, -6.5, 6.5);
    state.idle = 0;
  }

  if (!state.dragging && state.idle > 5 && !reduceMotion) {
    // 没人碰的时候，船自己慢慢偏一点方向
    state.targetX = Math.sin(state.time * 0.11) * 1.2;
  }

  const spring = 26;
  const damping = 7.5;
  state.boatVX += (state.targetX - state.boatX) * spring * dt;
  state.boatVX *= Math.exp(-damping * dt);
  state.boatX += state.boatVX * dt;

  const bob = reduceMotion ? 0 : Math.sin(state.time * 0.9) * 0.05 + Math.sin(state.time * 1.7) * 0.012;
  boat.position.x = state.boatX;
  boat.position.y = -0.08 + bob;
  boat.position.z = 0;
  boat.rotation.y = 0.62 - state.boatVX * 0.13 + Math.sin(state.time * 0.23) * 0.04;
  boat.rotation.z = state.boatVX * 0.045;
  boat.rotation.x = Math.sin(state.time * 0.7) * 0.02;

  // 灯随风轻轻摇，轻触纸船时会有一次更暖的呼吸
  state.lanternBoost = Math.max(0, state.lanternBoost - dt * 1.1);
  const glow = state.lanternBoost * state.lanternBoost;
  lanternGlow.material.opacity = 0.26 + Math.sin(state.time * 2.1) * 0.05 + glow * 0.5;
  lanternLight.intensity = 0.3 + Math.sin(state.time * 2.1) * 0.07 + glow * 1.1;
  boatGlow.material.opacity = palette.sea * (0.16 + Math.sin(state.time * 1.3) * 0.02);
}

function updateCamera(dt) {
  const parallaxX = reduceMotion ? 0 : state.pointerNX * 0.55;
  const parallaxY = reduceMotion ? 0 : state.pointerNY * 0.3;

  cameraTarget.set(
    state.boatX * frame.followCam + parallaxX,
    frame.camY + parallaxY + Math.sin(state.time * 0.21) * 0.08,
    frame.camZ
  );
  camera.position.lerp(cameraTarget, damp(dt, 1.7));

  boardTarget.set(
    state.boatX * frame.followLook + frame.lookX,
    0.78 + parallaxY * 0.25 + Math.sin(state.time * 0.17 + 1.4) * 0.06,
    -7
  );

  const look = state.lookAt;
  look.lerp(boardTarget, damp(dt, 2.2));
  camera.lookAt(look);
  camera.rotateZ(Math.sin(state.time * 0.13) * 0.006 + state.boatVX * 0.0035);
  if (Math.abs(camera.fov - state.targetFov) > 0.02) {
    camera.fov = lerp(camera.fov, state.targetFov, damp(dt, 3.4));
    camera.updateProjectionMatrix();
  }
  sky.position.copy(camera.position);
  sea.position.x = camera.position.x;
  sea.position.z = camera.position.z;
}

function updateStars(dt) {
  const p = stars.positions;
  const speed = 4.4;
  for (let i = 0; i < STAR_COUNT; i++) {
    const i3 = i * 3;
    p[i3 + 2] += dt * speed * (0.45 + stars.sizes[i] * 0.55);
    if (p[i3 + 2] > 40) {
      p[i3 + 2] -= 500;
      p[i3] = rand(-320, 320);
      p[i3 + 1] = Math.random() < 0.42
        ? 0.24 * p[i3 + 2] + 0.16 * p[i3] + gauss() * 26
        : rand(-150, 190);
    }
  }
  stars.geo.attributes.position.needsUpdate = true;

  const dp = dust.positions;
  for (let i = 0; i < dust.count; i++) {
    const i3 = i * 3;
    dp[i3 + 2] += dt * (5.5 + (i % 5) * 0.6);
    if (dp[i3 + 2] > 16) {
      dp[i3 + 2] -= 92;
      dp[i3] = rand(-22, 22);
      dp[i3 + 1] = rand(-14, 18);
    }
  }
  dust.geo.attributes.position.needsUpdate = true;

  for (const star of clickableStars) {
    const data = star.userData;
    star.position.z += dt * data.speed;
    star.position.x += Math.sin(state.time * 0.4 + data.phase) * dt * data.drift;
    if (star.position.z > 14) {
      star.position.z -= 88;
      star.position.x = rand(-17, 17);
      star.position.y = rand(-3.2, 8.5);
      data.lit = false;
      data.pulse = 0;
      star.material.opacity = 0.7;
    }

    const breathe = 0.9 + Math.sin(state.time * 0.9 + data.phase) * 0.1;
    const pulse = data.pulse * data.pulse;
    const scaleNow = data.baseScale * (breathe + pulse * 0.9 + (data.lit ? 0.24 : 0));
    star.scale.setScalar(scaleNow);
    data.pulse = Math.max(0, data.pulse - dt * 1.1);
    star.material.color.copy(starWhite).lerp(palette.accent, data.tint * (data.lit ? 0.85 : 0.4));
    star.material.opacity = (data.lit ? 0.92 : 0.62) + pulse * 0.3;
  }

  dust.mat.uniforms.uColor.value.copy(palette.star);
  dust.mat.uniforms.uAccent.value.copy(palette.accent);
  stars.mat.uniforms.uColor.value.copy(palette.star);
  stars.mat.uniforms.uAccent.value.copy(palette.accent);
}

function updateNebula(dt) {
  for (const mesh of nebulaSprites) {
    mesh.position.z += dt * mesh.userData.drift;
    if (mesh.position.z > 60) {
      mesh.position.z -= 470;
      mesh.position.x = rand(-160, 160);
      mesh.position.y = 0.22 * mesh.position.z + rand(-45, 45);
    }
    mesh.material.uniforms.uTime.value = state.time;
    mesh.material.uniforms.uColorA.value.copy(palette.nebulaA);
    mesh.material.uniforms.uColorB.value.copy(palette.nebulaB);
    mesh.material.uniforms.uOpacity.value =
      mesh.userData.opacity * (0.85 - palette.sea * 0.25) * (sceneIndex === 2 ? 0.7 : 1);
    mesh.material.uniforms.uSeed.value = mesh.userData.seed;
  }
}

function updateIslands(dt) {
  for (const island of islands) {
    const glow = island.userData.glow || 0;
    island.userData.glow = Math.max(0, glow - dt * 0.7);
    island.position.z += dt * (4.2 + island.userData.spin * 8);
    island.rotation.y += dt * island.userData.spin;
    island.position.y = island.userData.baseY + Math.sin(state.time * 0.22 + island.userData.bob) * 0.55 + glow * 0.7;
    if (island.userData.halo) island.userData.halo.material.opacity = 0.28 + glow * 0.45;
    if (island.position.z > 34) {
      island.position.z -= 300;
      island.position.x = rand(-26, 26);
      island.position.y = rand(-8, 12);
      island.userData.baseY = island.position.y;
      island.rotation.y = rand(0, 6.28);
    }
    island.children.forEach((child) => {
      if (child.userData && child.userData.base !== undefined) {
        child.position.y = child.userData.base + Math.sin(state.time * 0.7 + child.userData.phase) * 0.08;
        child.rotation.y += dt * 0.4;
      }
    });
  }
  crystalMaterial.color.copy(palette.accent).multiplyScalar(1.5);
  rockMaterial.color.copy(palette.top).lerp(rockBaseColor, 0.9);
  rockMaterialFar.color.copy(palette.top).lerp(rockFarColor, 0.94);
  sunLight.color.copy(palette.horizon).lerp(warmWhite, 0.45);
  hemi.color.copy(palette.accent);
  fillLight.color.copy(palette.accent);
}

function updateWake(dt) {
  // 每 35ms 在船尾落一个点，点会随着"水流"往镜头方向退
  if (state.time - wakeCursor.armed > 0.035) {
    wakeCursor.armed = state.time;
    const sternZ = 1.05;
    wake.unshift({
      x: boat.position.x + Math.sin(boat.rotation.y) * sternZ,
      y: -0.2,
      z: boat.position.z + Math.cos(boat.rotation.y) * sternZ,
      life: 1,
    });
    if (wake.length > MAX_WAKE) wake.pop();
  }

  for (const point of wake) {
    point.z += dt * 4.6;
    point.life -= dt * 1.5;
  }
  while (wake.length && wake[wake.length - 1].life <= 0) wake.pop();

  const n = wake.length;
  if (n < 2) {
    wakeGeo.setDrawRange(0, 0);
    wakeMesh.visible = false;
    return;
  }
  wakeMesh.visible = true;

  const up = new THREE.Vector3(0, 1, 0);
  const tan = new THREE.Vector3();
  const side = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const cur = wake[i];
    const next = wake[Math.min(i + 1, n - 1)];
    const prev = wake[Math.max(i - 1, 0)];
    tan.set(next.x - prev.x, 0, next.z - prev.z);
    side.crossVectors(up, tan);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    const fade = i / (n - 1);
    const wobble = Math.sin(i * 0.34 + state.time * 0.5) * 0.05 * fade;
    const width = 0.36 * (1 - fade * 0.88) * (0.35 + Math.min(1, i / 6) * 0.65);
    wakePositions[i * 6] = cur.x + wobble - side.x * width;
    wakePositions[i * 6 + 1] = cur.y;
    wakePositions[i * 6 + 2] = cur.z - side.z * width;
    wakePositions[i * 6 + 3] = cur.x + wobble + side.x * width;
    wakePositions[i * 6 + 4] = cur.y;
    wakePositions[i * 6 + 5] = cur.z + side.z * width;
  }
  wakeGeo.setDrawRange(0, (n - 1) * 6);
  wakeGeo.attributes.position.needsUpdate = true;
  wakeMaterial.uniforms.uColor.value.copy(palette.accent);
}

function updateRingsAndSparks(dt) {
  for (const ring of rings) {
    if (ring.life <= 0) continue;
    ring.life -= dt * 0.75;
    if (ring.life <= 0) {
      ring.sprite.visible = false;
      continue;
    }
    const t = 1 - ring.life;
    ring.sprite.scale.setScalar(ring.scale * (1.2 + t * 6.5));
    ring.sprite.material.opacity = Math.pow(ring.life, 1.6) * 0.9;
  }

  let dirty = false;
  for (let i = 0; i < MAX_SPARKS; i++) {
    const s = sparkState[i];
    if (s.life <= 0) {
      if (sparkAlphas[i] !== 0) {
        sparkAlphas[i] = 0;
        dirty = true;
      }
      continue;
    }
    s.life -= dt;
    const k = Math.max(0, s.life / s.max);
    sparkPositions[i * 3] += s.vx * dt;
    sparkPositions[i * 3 + 1] += s.vy * dt;
    sparkPositions[i * 3 + 2] += s.vz * dt;
    s.vx *= 0.985;
    s.vy = s.vy * 0.985 + dt * 0.25;
    s.vz *= 0.985;
    sparkAlphas[i] = k;
    dirty = true;
  }
  if (dirty) {
    sparkGeo.attributes.position.needsUpdate = true;
    sparkGeo.attributes.aAlpha.needsUpdate = true;
  }
  sparkMat.uniforms.uColor.value.copy(palette.accent);
}

function updatePalette(dt) {
  const k = damp(dt, 1.1);
  for (const key of colorKeys) palette[key].lerp(target[key], k);
  for (const key of scalarKeys) palette[key] = lerp(palette[key], target[key], k);

  skyMaterial.uniforms.uTop.value.copy(palette.top);
  skyMaterial.uniforms.uBottom.value.copy(palette.bottom);
  skyMaterial.uniforms.uHorizon.value.copy(palette.horizon);
  skyMaterial.uniforms.uSun.value.copy(palette.accent);
  skyMaterial.uniforms.uSunAmount.value = palette.sun;
  skyMaterial.uniforms.uTime.value = state.time;

  seaMaterial.uniforms.uDeep.value.copy(palette.top).lerp(new THREE.Color("#071a2c"), 0.55);
  seaMaterial.uniforms.uHorizon.value.copy(palette.bottom).lerp(palette.horizon, 0.5);
  seaMaterial.uniforms.uSun.value.copy(palette.accent);
  seaMaterial.uniforms.uOpacity.value = palette.sea;
  seaMaterial.uniforms.uSunAmount.value = palette.sun;
  seaMaterial.uniforms.uTime.value = state.time;
  sea.visible = palette.sea > 0.004;

  sunSprite.material.opacity = palette.sun * 0.55;
  sunSprite.material.color.copy(palette.accent);

  planetLightTmp.copy(palette.accent).lerp(palette.star, 0.4);
  planetDarkTmp.copy(palette.top).lerp(planetDeep, 0.55);
  planetMat.uniforms.uLight.value.copy(planetLightTmp);
  planetMat.uniforms.uDark.value.copy(planetDarkTmp);
  planetMat.uniforms.uGlow.value.copy(palette.accent);
  planetGlow.material.color.copy(palette.accent);
  planetRing.material.color.copy(palette.accent).lerp(palette.star, 0.35);
  planetRing.material.opacity = 0.14 + (1 - palette.sea) * 0.05;
  planetGroup.visible = palette.sea < 0.32;

  bloom.strength = palette.bloom;
  renderer.toneMappingExposure = palette.exposure;
  grade.uniforms.uTint.value.copy(palette.tint);
  grade.uniforms.uVignette.value = 0.4 + palette.sea * 0.06;
  grade.uniforms.uTime.value = state.time;
  grade.uniforms.uGrain.value = reduceMotion ? 0 : 0.035;
  grade.uniforms.uAberration.value = reduceMotion ? 0 : 0.0016;
  boatGlow.material.color.copy(palette.accent).lerp(new THREE.Color(0xffc48a), 0.5);
}

function updateSunset(dt) {
  // 晨光场景里太阳会从外面慢慢移入构图
  sunSprite.position.x = -268;
  const target = palette.sun;
  sunSprite.scale.setScalar(240 + target * 70);
}

function update(dt) {
  state.time += dt;
  state.fade = Math.min(1, state.fade + dt / 1.5);
  grade.uniforms.uFade.value = state.fade * state.fade * (3 - 2 * state.fade);
  updatePalette(dt);
  updateBoat(dt);
  updateCamera(dt);
  updateStars(dt);
  updateNebula(dt);
  updateIslands(dt);
  planet.rotation.y += dt * 0.018;
  planetRing.rotation.z += dt * 0.004;
  updateMeteor(dt);
  updateConstellation(dt);
  updateWake(dt);
  updateRingsAndSparks(dt);
  updateSunset(dt);
  stars.mat.uniforms.uTime.value = state.time;
  dust.mat.uniforms.uTime.value = state.time;
}

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000) || 0;
  last = now;

  if (document.hidden) return;

  update(dt);

  // 自适应画质：连续掉帧时安静地降一点分辨率
  state.frames++;
  state.frameAvg += ((dt * 1000) - state.frameAvg) * 0.05;
  if (!state.qualityReduced && state.frames > 150 && state.frameAvg > 27) {
    state.qualityReduced = true;
    pixelRatio = Math.max(1, pixelRatio * 0.75);
    resize();
  }

  composer.render();
}

/* ------------------------------------------------------------
   启动
   ------------------------------------------------------------ */
setScene(0, false);
updatePalette(1);
resize();
composer.render();

requestAnimationFrame((t) => {
  last = t;
  loop(t);
});

const loader = document.getElementById("loader");
window.setTimeout(() => loader.classList.add("done"), 650);
window.setTimeout(() => {
  if (!hintHidden) hideHint();
}, 14000);
document.addEventListener("visibilitychange", () => {
  last = performance.now();
});
window.addEventListener("beforeunload", () => {
  audio.ctx?.close?.();
});

// 方便在控制台里玩：调整构图、暂停帧等
window.__starDrift = {
  renderer,
  scene,
  camera,
  boat,
  composer,
  setScene,
  palette,
  bloom,
  parts: { boat, hull, deck, sail, mast, lantern, lanternGlow, boatGlow, sunSprite, wakeMesh },
  stars: clickableStars,
  constellation: constellationStars,
  islandRocks,
  boatMeshes,
  planetGroup,
  meteor,
  state,
  render: () => {
    update(0);
    composer.render();
  },
  warm: (seconds = 4) => {
    const steps = Math.round(seconds * 60);
    for (let i = 0; i < steps; i++) update(1 / 60);
    composer.render();
  },
};
