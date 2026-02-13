import * as THREE from "three";

const PARTICLE_COUNT = 85000;
const TEXT_SCALE = 0.16;

const ROT_SENS = 1.6;
const ROT_CLAMP = 0.85;
const ROT_SMOOTH = 0.08;

// hand-distance zoom
const PALM_MIN = 0.12;
const PALM_MAX = 0.30;
const PROX_SMOOTH = 0.14;

// base presets
const CAM = { idle: 38, heart: 40, text: 46 };
const ZR = { idle: 4.0, heart: 5.0, text: 5.5 };
const CAM_CLAMP = {
  idle: [34, 44],
  heart: [34, 46],
  text: [40, 56],
};

// pinch gifs (exactly 4)
const PINCH_GIFS = [
  "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExdDg1dXJqdDJsdDRnY3JzNzh1Mmd0N3QxdTRjejB5emx4eDI4ZzY4eiZlcD12MV9pbnRlcm5hbF9naWY_by_id&ct=g&cid=790b7611t85urjt2slt4g3rs78u2mgt7q1t4zj5zlx2z8gz8z/KztT2c4u8mYYUiMKdJ/giphy.gif",
  "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExbTFkaGE4Nmtzdzl5NzY0a3ByNmIxcjBza3B4cWVraWNjdmlmZGh0bCZlcD12MV9pbnRlcm5hbF9naWY_by_id&ct=g&cid=790b7611m1dha86ksw9y764kpr6m1r0skpxqekiccvifdhtb/SILTTnZ7qHX2Y6Oqtm/giphy.gif",
  "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExYTRxdXFtajdoaHc2dWc5OG9ua3lmOTIxcmkybndiNHhqeTBxcmJ0NiZlcD12MV9pbnRlcm5hbF9naWY_by_id&ct=g&cid=790b7611a4quqmj7hhw6uwg98onkyf921ri2wnb4xqyt0rbt6/wPnbkEcr2tXiTN0Lmq/giphy.gif",
  "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExcXcyNTI0djl0emg3ZjZpOWV1amZpcnNmbHk3d3c4MnF3c244bnk3ZyZlcD12MV9pbnRlcm5hbF9naWY_by_id&ct=g&cid=790b7611qw2524v9tzh7f6i9uejzirsfly7ww82wqso48ny7g/1JmGiBtqTuehfYxuy9/giphy.gif",
];

// AUDIO (same folder)
const bgAudioEl = document.getElementById("nebula-audio");
bgAudioEl.src = "bg.webm";
bgAudioEl.volume = 0.0;

const sweetAudioEl = document.getElementById("sweet-audio");
sweetAudioEl.src = "sweetbg.webm";
sweetAudioEl.volume = 0.0;

// text responsiveness tuning
let textScale = TEXT_SCALE;
let textFontPx = 65;

let scene, camera, renderer, points, material, geometry;
let targetMorph = 0,
  currentMorph = 0;
let baseCamZ = CAM.idle,
  targetCamZ = CAM.idle;
let mode = "idle";

let targetRotX = 0,
  targetRotY = 0;
let handPresent = false;
let prox01 = 0.5;

let lastGesture = "none",
  gestureStartTime = 0,
  lastExecutedGesture = "none";
const STABILITY_MS = 1000;

// allow proximity zoom on ALL gestures EXCEPT pinch
let allowProxZoom = true;

// pinch state
let pinchActive = false;
let beforePinchMode = "idle";

// pinch animation state
let pinchBurstActive = false;
let pinchBurstStart = 0;
const PINCH_BURST_MS = 520;

// lock camera z during pinch so it NEVER zooms
let pinchLockZ = CAM.idle;

// pinch burst targets
let pinchSeedX = 0,
  pinchSeedY = 0;
let pinchRingPts = null;

// disable valentine modal after completion
let valentineCompleted = false;

// pinch completes on RELEASE (prevents flow from getting stuck on pinch)
let pinchStepPendingComplete = false;

const zJitter = new Float32Array(PARTICLE_COUNT);
for (let i = 0; i < PARTICLE_COUNT; i++) zJitter[i] = (Math.random() - 0.5) * 1.0;

// DOM
const uiWrapper = document.getElementById("ui-wrapper");
const permScreen = document.getElementById("permission-screen");
const loadScreen = document.getElementById("loading-screen");
const loadStatus = document.getElementById("load-status");
const gestureHint = document.getElementById("gesture-hint");
const cinematic = document.getElementById("cinematic");
const toast = document.getElementById("center-toast");
const gif = document.getElementById("cute-gif");

// permission intro block (in the permission screen)
const preMsg = document.querySelector("#permission-screen .pre-msg");

// HUD
const stepBadge = document.getElementById("step-badge");
const tutorialPanel = document.getElementById("tutorial-panel");
const stepListEl = document.getElementById("step-list");
const cameraPip = document.getElementById("camera-pip");

// Mobile “compact steps” toggle state
let stepsExpanded = false;
const isCompactTutorial = () =>
  window.matchMedia && window.matchMedia("(max-width: 820px)").matches;

function setTutorialExpanded(expanded) {
  stepsExpanded = expanded;
  if (!tutorialPanel) return;
  tutorialPanel.setAttribute("aria-hidden", expanded ? "false" : "true");
}

function syncTutorialPanelLayout() {
  if (!tutorialPanel) return;
  if (isCompactTutorial()) setTutorialExpanded(false);
  else setTutorialExpanded(true);
}

function toggleTutorialPanel() {
  if (!tutorialPanel) return;
  if (!isCompactTutorial()) return;
  setTutorialExpanded(!stepsExpanded);
}

// Make step badge usable as the mobile “Steps” toggle (tap + keyboard)
if (stepBadge) {
  stepBadge.setAttribute("role", "button");
  stepBadge.setAttribute("tabindex", "0");
  stepBadge.setAttribute("aria-controls", "tutorial-panel");

  stepBadge.addEventListener("click", () => toggleTutorialPanel());
  stepBadge.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleTutorialPanel();
    }
  });
}

// Modal
const modal = document.getElementById("valentine-modal");
const yesBtn = document.getElementById("yes-btn");
const noBtn = document.getElementById("no-btn");
const modalSub = document.getElementById("modal-sub");
const noCounter = document.getElementById("no-counter");

const updateLoadStatus = (msg) => (loadStatus.innerText = msg.toUpperCase());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// Tutorial steps (flow gate: users can only progress in order)
const TUTORIAL_STEPS = [
  { key: "heart", label: "OPEN PALM", sub: "Open palm to wake the nebula  <i class='fa-solid fa-hand'></i>" },
  { key: "love", label: "CLOSE PALM", sub: "Close palm to gather stars  <i class='fa-solid fa-hand-fist'></i>" },
  { key: "pinch", label: "PINCH", sub: "Pinch to reveal a surprise  <i class='fa-solid fa-hand-point-up'></i>" },
  { key: "bitch", label: "HINT", sub: "Hint: i dont like u what hand guesture will u give to me?  <i class='fa-solid fa-hand-middle-finger'></i>" },
  { key: "valentine", label: "PEACE", sub: "Peace sign to ask the question  <i class='fa-solid fa-hand-peace'></i>" },
];

let tutorialStep = 0;
let tutorialDone = false;
let valentineLocked = false;
let noAttempts = 0;

function buildStepList() {
  stepListEl.innerHTML = "";
  TUTORIAL_STEPS.forEach((s, i) => {
    const li = document.createElement("li");
    li.className = "step-item";
    li.dataset.i = String(i);
    li.innerHTML = `
      <div class="step-dot"></div>
      <div class="step-text">
        <div class="label">${s.label}</div>
        <div class="sub">${s.sub}</div>
      </div>
    `;
    stepListEl.appendChild(li);
  });
  renderTutorialUI();
}

function renderTutorialUI() {
  const total = TUTORIAL_STEPS.length;

  if (tutorialDone) stepBadge.textContent = "EXPLORE MODE";
  else stepBadge.textContent = `FLOW ${tutorialStep + 1}/${total}`;

  const items = stepListEl.querySelectorAll(".step-item");
  items.forEach((el, idx) => {
    el.classList.toggle("active", !tutorialDone && idx === tutorialStep);
    el.classList.toggle("done", idx < tutorialStep);
  });

  if (!tutorialDone && !valentineLocked) {
    const s = TUTORIAL_STEPS[tutorialStep];
    if (s) {
      // hint text supports inline icons
      gestureHint.innerHTML = s.sub;
    }
  }
}

function expectedGesture() {
  if (tutorialDone) return null;
  return TUTORIAL_STEPS[tutorialStep]?.key ?? null;
}

function completeStep(key) {
  if (tutorialDone) return;
  const expected = expectedGesture();
  if (!expected || key !== expected) return;

  if (key !== "valentine") {
    tutorialStep = Math.min(tutorialStep + 1, TUTORIAL_STEPS.length);
    if (tutorialStep >= TUTORIAL_STEPS.length) tutorialDone = true;
    showCenterToast("STEP COMPLETE", 650);
    renderTutorialUI();
  }
}

// Audio helpers (smooth fades, avoids harsh volume jumps)
function fadeVolume(el, targetVolume = 0.3, ms = 1200) {
  const start = performance.now();
  const from = el.volume;
  const to = clamp(targetVolume, 0, 1);

  const tick = (now) => {
    const t = clamp((now - start) / ms, 0, 1);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    el.volume = from + (to - from) * e;
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function primeAllAudio() {
  try {
    bgAudioEl.volume = 0.0;
    const p1 = bgAudioEl.play();
    if (p1 && typeof p1.catch === "function") p1.catch(() => {});
  } catch {}

  try {
    sweetAudioEl.volume = 0.0;
    const p2 = sweetAudioEl.play();
    if (p2 && typeof p2.catch === "function") p2.catch(() => {});
    sweetAudioEl.pause();
    sweetAudioEl.currentTime = 0;
  } catch {}
}

function playSweetMoment() {
  try {
    sweetAudioEl.currentTime = 0;
    sweetAudioEl.volume = 0.0;
    const p = sweetAudioEl.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
    fadeVolume(bgAudioEl, 0.08, 600);
    fadeVolume(sweetAudioEl, 0.75, 650);
  } catch {}
}

// Modal logic (peace step)
function disableValentineModalForever() {
  valentineCompleted = true;

  yesBtn.disabled = true;
  noBtn.disabled = true;
  noBtn.style.display = "none";

  modal.classList.remove("show");
  modal.style.display = "none";
}

function openValentineModal() {
  if (valentineCompleted) return;

  valentineLocked = true;
  modal.style.display = "flex";
  requestAnimationFrame(() => modal.classList.add("show"));

  noAttempts = 0;
  noCounter.textContent = "";
  noBtn.style.display = "inline-block";
  noBtn.disabled = false;
  noBtn.style.opacity = "1";
  noBtn.style.transform = "translate(0,0)";
  modalSub.innerText = "Be honest... but not too honest";

  playSweetMoment();
  gestureHint.innerText = " ";
}

function closeValentineModal() {
  modal.classList.remove("show");
  setTimeout(() => {
    modal.style.display = "none";
  }, 260);
  valentineLocked = false;
  renderTutorialUI();
}

function acceptYes() {
  closeValentineModal();

  if (!tutorialDone && expectedGesture() === "valentine") {
    tutorialStep = Math.min(tutorialStep + 1, TUTORIAL_STEPS.length);
    if (tutorialStep >= TUTORIAL_STEPS.length) tutorialDone = true;
  }
  renderTutorialUI();

  disableValentineModalForever();

  setMode("text");
  showCenterToast("OKAYYYYY", 1100);
  setTarget(getTextPoints("CAN U BE MY VALENTINE DATE?"));
}

function dodgeNo() {
  noAttempts++;
  noCounter.textContent = `NO ATTEMPTS: ${noAttempts}/7`;

  const dx = Math.round(Math.random() * 180 - 90);
  const dy = Math.round(Math.random() * 60 - 30);
  noBtn.style.transform = `translate(${dx}px, ${dy}px)`;
  noBtn.style.opacity = "0.78";

  if (noAttempts >= 7) {
    noBtn.disabled = true;
    noBtn.style.display = "none";
    modalSub.innerText = "Nice try. Only YES is left now.";
    noCounter.textContent = "NO OPTION REMOVED";
  } else {
    modalSub.innerText = "Nope. try again...";
  }
}

yesBtn.addEventListener("click", acceptYes);
noBtn.addEventListener("click", dodgeNo);

// Responsive helpers (mobile-like = coarse pointer or small viewport)
const isMobileLike = () => {
  const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  return coarse || Math.min(window.innerWidth, window.innerHeight) < 700;
};

function updateTextTuning() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const s = clamp(Math.min(w / 900, h / 700), 0.55, 1.0);
  textScale = TEXT_SCALE * s;
  textFontPx = Math.round(clamp(65 * s, 44, 65));
}

function getBaseCam(nextMode) {
  if (isMobileLike()) {
    if (nextMode === "text") return 58;
    if (nextMode === "heart") return 48;
    if (nextMode === "idle") return 42;
  }
  return CAM[nextMode] ?? CAM.idle;
}

function getZoomRange(nextMode) {
  if (isMobileLike()) {
    if (nextMode === "text") return 3.6;
    if (nextMode === "heart") return 4.2;
    if (nextMode === "idle") return 3.0;
  }
  return ZR[nextMode] ?? 4.0;
}

function getCamClamp(nextMode) {
  if (isMobileLike()) {
    if (nextMode === "text") return [50, 72];
    if (nextMode === "heart") return [40, 60];
    if (nextMode === "idle") return [36, 54];
  }
  return CAM_CLAMP[nextMode] ?? [34, 56];
}

// Toast + GIF helpers (UI feedback without blocking the animation)
let toastTimer = null;
function showCenterToast(msg, duration = 900) {
  toast.textContent = msg;
  toast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), duration);
}

function showGifOff() {
  gif.classList.remove("show");
  gif.style.visibility = "hidden";
  setTimeout(() => {
    gif.style.display = "none";
  }, 450);
}

function loadGifWithFallback(urlList) {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const used = new Set();

    const attempt = () => {
      if (tries >= urlList.length) return reject(new Error("All GIFs failed"));
      tries++;

      let pick;
      do {
        pick = urlList[Math.floor(Math.random() * urlList.length)];
      } while (used.has(pick) && used.size < urlList.length);
      used.add(pick);

      gif.onload = () => resolve(pick);
      gif.onerror = () => attempt();

      gif.style.display = "block";
      gif.style.visibility = "hidden";
      gif.classList.remove("show");
      gif.src = pick;
    };

    attempt();
  });
}

async function showGifOn() {
  try {
    await loadGifWithFallback(PINCH_GIFS);
    requestAnimationFrame(() => {
      gif.style.visibility = "visible";
      gif.classList.add("show");
    });
  } catch {
    showGifOff();
  }
}

function waitForMediaPipe(timeoutMs = 8000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (window.Hands && window.Camera) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("MediaPipe load timeout"));
      requestAnimationFrame(tick);
    };
    tick();
  });
}

// Permission entrance: show the pre-message, then reveal the normal permission UI
async function playPermissionIntro() {
  if (!permScreen) return;

  if (!preMsg) return;

  const kids = Array.from(permScreen.children);

  kids.forEach((el) => {
    if (el !== preMsg) el.style.display = "none";
  });

  preMsg.style.display = "block";
  preMsg.style.opacity = "0";
  preMsg.style.transition = "opacity 1.1s ease";
  preMsg.style.pointerEvents = "none";

  await sleep(120);
  preMsg.style.opacity = "1";
  await sleep(1500);

  preMsg.style.opacity = "0";
  await sleep(1100);

  kids.forEach((el) => {
    if (el !== preMsg) el.style.display = "";
  });

  preMsg.style.display = "none";
  preMsg.style.opacity = "0";
  preMsg.style.pointerEvents = "none";
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    playPermissionIntro().catch(() => {});
  });
} else {
  playPermissionIntro().catch(() => {});
}

// Entrance sequence after loading is done
async function playCinematicEntrance() {
  cinematic.style.display = "flex";
  requestAnimationFrame(() => cinematic.classList.add("show"));
  await sleep(1400);

  cinematic.classList.remove("show");
  await sleep(1200);

  cinematic.style.display = "none";
  if (renderer?.domElement) renderer.domElement.style.opacity = "1";

  gestureHint.style.opacity = "1";
  stepBadge.style.opacity = "1";
  tutorialPanel.style.opacity = "1";
  cameraPip.style.opacity = "1";

  fadeVolume(bgAudioEl, 0.3, 1600);
  renderTutorialUI();
}

// Start button
document.getElementById("start-btn").onclick = async () => {
  try {
    primeAllAudio();

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((t) => t.stop());

    permScreen.style.display = "none";
    loadScreen.style.display = "block";

    updateLoadStatus("Accessing Camera...");
    await sleep(800);

    updateLoadStatus("Initializing MediaPipe AI...");
    await waitForMediaPipe().catch(() => {});
    await sleep(800);

    updateLoadStatus("Mapping Starfield Coordinates...");
    initThree();
    await sleep(900);

    updateLoadStatus("Synchronizing Gesture Library...");
    startAI();
    await sleep(900);

    updateLoadStatus("Ready.");
    await sleep(350);

    uiWrapper.style.opacity = "0";
    setTimeout(() => (uiWrapper.style.display = "none"), 950);

    tutorialPanel.style.display = "block";
    cameraPip.style.display = "block";
    stepBadge.style.display = "block";
    buildStepList();

    syncTutorialPanelLayout();

    await playCinematicEntrance();
  } catch (e) {
    alert("Camera access is required. Refresh and allow camera to enter Nebula.");
  }
};

// Shaders
const vertexShader = `
  uniform float uTime;
  uniform float uMorph;
  attribute vec3 targetPos;
  attribute float aSize;
  varying vec3 vColor;

  void main() {
    vec3 pos = mix(position, targetPos, uMorph);

    float driftFactor = mix(1.0, 0.18, uMorph);
    pos.x += sin(uTime * 0.15 + position.z) * 0.2 * driftFactor;
    pos.y += cos(uTime * 0.15 + position.x) * 0.2 * driftFactor;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    float sizeMultiplier = mix(1.0, 1.25, uMorph);
    gl_PointSize = clamp((aSize * (45.0 * sizeMultiplier)) / -mvPosition.z, 1.0, 72.0);
    gl_Position = projectionMatrix * mvPosition;

    vec3 colorCore = vec3(1.0, 1.0, 1.0);
    vec3 colorEdge = vec3(1.0, 0.05, 0.6);
    float dist = length(pos) / 30.0;
    vColor = mix(colorCore, colorEdge, clamp(dist + (1.0 - uMorph), 0.0, 1.0));
  }
`;

const fragmentShader = `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    gl_FragColor = vec4(vColor, smoothstep(0.5, 0.1, d) * 0.9);
  }
`;

// Three.js init + animate
function getUniverseData() {
  const pos = new Float32Array(PARTICLE_COUNT * 3);
  const sizes = new Float32Array(PARTICLE_COUNT);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const r = Math.pow(Math.random(), 0.5) * 40;
    const theta = r * 0.2 + (i % 3) * (Math.PI * 0.66);
    pos[i * 3] = Math.cos(theta) * r + (Math.random() - 0.5) * 10;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 12;
    pos[i * 3 + 2] = Math.sin(theta) * r + (Math.random() - 0.5) * 10;
    sizes[i] = 0.5 + Math.random() * 0.5;
  }
  return { pos, sizes };
}

function updateCameraFov() {
  if (!camera) return;
  const aspect = window.innerWidth / window.innerHeight;
  camera.fov = aspect < 0.9 ? 72 : 60;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}

function initThree() {
  updateTextTuning();

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 100;
  updateCameraFov();

  const mobile = isMobileLike();
  renderer = new THREE.WebGLRenderer({ antialias: !mobile, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.35 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  document.body.appendChild(renderer.domElement);

  renderer.domElement.style.opacity = "0";
  renderer.domElement.style.transition = "opacity 1.2s ease";

  geometry = new THREE.BufferGeometry();
  const universe = getUniverseData();
  geometry.setAttribute("position", new THREE.BufferAttribute(universe.pos, 3));
  geometry.setAttribute("targetPos", new THREE.BufferAttribute(new Float32Array(PARTICLE_COUNT * 3), 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(universe.sizes, 1));

  material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uMorph: { value: 0 } },
    vertexShader,
    fragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  points = new THREE.Points(geometry, material);
  scene.add(points);

  animate();
}

function applyHandZoom() {
  if (!allowProxZoom) return;
  const t = (0.5 - prox01) * 2.0;
  const zr = getZoomRange(mode);
  const base = baseCamZ;
  const [minZ, maxZ] = getCamClamp(mode);
  targetCamZ = clamp(base + t * zr, minZ, maxZ);
}

function animate() {
  requestAnimationFrame(animate);

  const time = performance.now() * 0.001;
  material.uniforms.uTime.value = time;

  currentMorph += (targetMorph - currentMorph) * 0.045;
  material.uniforms.uMorph.value = currentMorph;

  if (pinchBurstActive && pinchRingPts) {
    const t = clamp((performance.now() - pinchBurstStart) / PINCH_BURST_MS, 0, 1);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    targetCamZ = pinchLockZ;

    const targetAttr = geometry.attributes.targetPos.array;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      const pt = pinchRingPts[i % pinchRingPts.length];

      const sx = pinchSeedX + Math.sin(i * 12.9898) * 0.18;
      const sy = pinchSeedY + Math.cos(i * 78.233) * 0.18;

      targetAttr[i3] = sx + (pt.x - sx) * e;
      targetAttr[i3 + 1] = sy + (pt.y - sy) * e;
      targetAttr[i3 + 2] = zJitter[i] * 0.9;
    }
    geometry.attributes.targetPos.needsUpdate = true;

    if (t >= 1) {
      pinchBurstActive = false;
      setTarget(pinchRingPts);
    }
  } else {
    if (pinchActive) targetCamZ = pinchLockZ;
    else applyHandZoom();
  }

  camera.position.z += (targetCamZ - camera.position.z) * 0.04;

  if (!handPresent) {
    targetRotY += 0.0018;
    targetRotX = Math.sin(time * 0.4) * 0.1;
  }

  if (points) {
    points.rotation.x += (targetRotX - points.rotation.x) * ROT_SMOOTH;
    points.rotation.y += (targetRotY - points.rotation.y) * ROT_SMOOTH;
  }

  renderer?.render(scene, camera);
}

// Shapes
function getHeartPoints() {
  const arr = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const t = Math.random() * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    arr[i * 3] = x * 1.1;
    arr[i * 3 + 1] = y * 1.1;
    arr[i * 3 + 2] = (Math.random() - 0.5) * 5;
  }
  return arr;
}

const tCanvas = document.createElement("canvas");
const tCtx = tCanvas.getContext("2d");
tCanvas.width = 1200;
tCanvas.height = 400;

function getTextPoints(text) {
  updateTextTuning();

  tCtx.clearRect(0, 0, 1200, 400);
  tCtx.fillStyle = "white";
  tCtx.font = `bold ${textFontPx}px Arial`;
  tCtx.textAlign = "center";
  tCtx.textBaseline = "middle";

  if (text.length > 20) {
    tCtx.fillText("CAN U BE MY", 600, 160);
    tCtx.fillText("VALENTINE DATE?", 600, 240);
  } else {
    tCtx.fillText(text, 600, 200);
  }

  const data = tCtx.getImageData(0, 0, 1200, 400).data;
  const pts = [];
  for (let y = 0; y < 400; y += 4) {
    for (let x = 0; x < 1200; x += 4) {
      if (data[(y * 1200 + x) * 4] > 128) {
        pts.push({ x: (x - 600) * textScale, y: (200 - y) * textScale });
      }
    }
  }
  return pts;
}

function setTarget(dataPoints) {
  const targetAttr = geometry.attributes.targetPos.array;
  const isArr = Array.isArray(dataPoints);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const i3 = i * 3;
    if (!isArr) {
      targetAttr[i3] = dataPoints[i3];
      targetAttr[i3 + 1] = dataPoints[i3 + 1];
      targetAttr[i3 + 2] = dataPoints[i3 + 2];
    } else {
      const pt = dataPoints[i % dataPoints.length];
      targetAttr[i3] = pt.x;
      targetAttr[i3 + 1] = pt.y;
      targetAttr[i3 + 2] = zJitter[i];
    }
  }
  geometry.attributes.targetPos.needsUpdate = true;
  targetMorph = 1.0;
}

function setMode(next) {
  mode = next;
  baseCamZ = getBaseCam(next);
}

function updateProximityFromHand(marks) {
  const palm = Math.hypot(marks[5].x - marks[17].x, marks[5].y - marks[17].y);
  const raw = clamp((palm - PALM_MIN) / (PALM_MAX - PALM_MIN), 0, 1);
  prox01 += (raw - prox01) * PROX_SMOOTH;
}

// Pinch burst
function runPinchBurst() {
  const pos = geometry.attributes.position.array;
  const idx = Math.floor(Math.random() * PARTICLE_COUNT);

  pinchSeedX = pos[idx * 3];
  pinchSeedY = pos[idx * 3 + 1];

  const pts = [];
  const ringCount = 2600;
  const radius = isMobileLike() ? 12.6 : 14.2;
  const thick = isMobileLike() ? 2.0 : 2.4;

  for (let i = 0; i < ringCount; i++) {
    const a = (i / ringCount) * Math.PI * 2;
    const r = radius + (Math.random() - 0.5) * thick;
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  pinchRingPts = pts;

  const seedPts = [];
  for (let i = 0; i < 1800; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 0.28;
    seedPts.push({ x: pinchSeedX + Math.cos(a) * r, y: pinchSeedY + Math.sin(a) * r });
  }
  setTarget(seedPts);

  pinchBurstActive = true;
  pinchBurstStart = performance.now();
}

// AI / MediaPipe
async function startAI() {
  const video = document.getElementById("self-video");
  video.setAttribute("playsinline", "true");
  video.muted = true;

  const HandsCtor = window.Hands;
  const CameraCtor = window.Camera;

  const hands = new HandsCtor({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });

  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.8,
    minTrackingConfidence: 0.75,
  });

  hands.onResults((results) => {
    const barCont = document.getElementById("charge-bar-container");
    const bar = document.getElementById("charge-bar");

    const hasHands = results.multiHandLandmarks && results.multiHandLandmarks.length > 0;
    handPresent = hasHands;

    if (valentineLocked) {
      barCont.style.display = "none";
      bar.style.width = "0%";
      return;
    }

    let detected = "none";

    if (hasHands) {
      const marks = results.multiHandLandmarks[0];

      updateProximityFromHand(marks);

      targetRotY = clamp(-(marks[0].x - 0.5) * ROT_SENS, -ROT_CLAMP, ROT_CLAMP);
      targetRotX = clamp((marks[0].y - 0.5) * ROT_SENS, -ROT_CLAMP, ROT_CLAMP);

      const UP_MARGIN = 0.018;
      const isUp = (tip, pip) => marks[tip].y < marks[pip].y - UP_MARGIN;

      const indexUp = isUp(8, 6);
      const middleUp = isUp(12, 10);
      const ringUp = isUp(16, 14);
      const pinkyUp = isUp(20, 18);

      const upCount = (indexUp ? 1 : 0) + (middleUp ? 1 : 0) + (ringUp ? 1 : 0) + (pinkyUp ? 1 : 0);

      const pinch = Math.hypot(marks[4].x - marks[8].x, marks[4].y - marks[8].y) < 0.032;

      const peace = indexUp && middleUp && upCount === 2;
      const middleFinger = middleUp && upCount === 1;
      const openPalm = upCount >= 3;
      const closedPalm = upCount <= 1 && !middleFinger && !peace;

      if (pinch) detected = "pinch";
      else if (peace) detected = "valentine";
      else if (middleFinger) detected = "bitch";
      else if (openPalm) detected = "heart";
      else if (closedPalm) detected = "love";
      else detected = "none";
    } else {
      prox01 += (0.5 - prox01) * 0.06;
    }

    // Flow gating: before "Explore Mode", only accept the expected gesture for the current step
    const exp = expectedGesture();
    const actionGesture = tutorialDone ? detected : exp && detected === exp ? detected : "none";

    // Pinch is special: it fires instantly, completes on release
    if (actionGesture === "pinch") {
      if (!pinchActive) {
        pinchActive = true;
        beforePinchMode = mode;

        pinchLockZ = camera?.position?.z ?? targetCamZ;
        targetCamZ = pinchLockZ;
        allowProxZoom = false;

        toast.classList.remove("show");
        barCont.style.display = "none";
        bar.style.width = "0%";

        runPinchBurst();
        showGifOn();

        gestureHint.innerText = " ";

        pinchStepPendingComplete = true;
      }
      return;
    } else if (pinchActive) {
      pinchActive = false;
      allowProxZoom = true;

      showGifOff();
      pinchRingPts = null;
      pinchBurstActive = false;
      setMode(beforePinchMode || "idle");

      if (!tutorialDone && pinchStepPendingComplete && expectedGesture() === "pinch") {
        completeStep("pinch");
      }
      pinchStepPendingComplete = false;

      renderTutorialUI();
    }

    // Stability hold: users must hold the correct gesture long enough to confirm it
    if (actionGesture === lastGesture && actionGesture !== "none") {
      const progress = Math.min(((Date.now() - gestureStartTime) / STABILITY_MS) * 100, 100);

      if (progress < 100) {
        barCont.style.display = "block";
        bar.style.width = progress + "%";
        gestureHint.innerText = "HOLDING...";
      } else {
        barCont.style.display = "none";
        if (lastExecutedGesture !== actionGesture) {
          execute(actionGesture);
          lastExecutedGesture = actionGesture;
        }
      }
    } else {
      lastGesture = actionGesture;
      lastExecutedGesture = "none";
      gestureStartTime = Date.now();
      barCont.style.display = "none";

      if (actionGesture === "none") {
        if (!hasHands) {
          setMode("idle");
          targetMorph = 0.0;
          gestureHint.innerText = "Waiting for Hands";
        } else {
          renderTutorialUI();
        }
      }
    }
  });

  const cam = new CameraCtor(video, {
    onFrame: async () => {
      await hands.send({ image: video });
    },
    width: 640,
    height: 480,
  });
  cam.start();
}

// Execute actions
function execute(g) {
  if (g === "valentine") {
    if (valentineCompleted || tutorialDone) {
      setMode("text");
      gestureHint.innerText = " ";
      showCenterToast("PEACE", 750);
      setTarget(getTextPoints("CAN U BE MY VALENTINE DATE?"));
      return;
    }

    setMode("idle");
    targetMorph = 0.0;
    showCenterToast("WAIT", 700);
    openValentineModal();
    return;
  }

  if (g === "heart") {
    setMode("heart");
    gestureHint.innerText = " ";
    showCenterToast("Forming Heart", 700);
    setTarget(getHeartPoints());
    completeStep("heart");
  } else if (g === "love") {
    setMode("text");
    gestureHint.innerText = " ";
    showCenterToast("I LOVE YOUUU", 900);
    setTarget(getTextPoints("I LOVE YOUUU"));
    completeStep("love");
  } else if (g === "bitch") {
    setMode("text");
    gestureHint.innerText = " ";
    showCenterToast("HEY YOU", 900);
    setTarget(getTextPoints("HEY YOU"));
    completeStep("bitch");
  }

  renderTutorialUI();
}

// Resize
window.addEventListener("resize", () => {
  if (!camera || !renderer) return;
  updateTextTuning();
  updateCameraFov();
  syncTutorialPanelLayout();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobileLike() ? 1.35 : 2));
});
