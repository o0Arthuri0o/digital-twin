import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
const MODEL_PATH = "/roboarm.glb";

let parts: {
  base?: THREE.Object3D;
  shoulder?: THREE.Object3D;
  elbow?: THREE.Object3D;
  wrist?: THREE.Object3D;
  finger_r?: THREE.Object3D;
  finger_l?: THREE.Object3D;
} = {};

const OLED_WIDTH = 128;
const OLED_HEIGHT = 64;
const OLED_SCREEN_NAME = "OLED_SCREEN";

let oledCanvas: HTMLCanvasElement | null = null;
let oledCtx: CanvasRenderingContext2D | null = null;
let oledTexture: THREE.CanvasTexture | null = null;
let oledScreen: THREE.Mesh | null = null;
let oledText = "OLED READY";
let oledBitmap: Uint8Array | null = null;

const targetAngles = {
  base: 90,
  shoulder: 90,
  elbow: 90,
  wrist: 90,
  gripper: 90,
};

export function setServoAngle(servoIndex: number, angle: number) {
  switch (servoIndex) {
    case 0:
      targetAngles.base = angle;
      break;
    case 1:
      targetAngles.shoulder = angle;
      break;
    case 2:
      targetAngles.elbow = angle;
      break;
    case 3:
      targetAngles.wrist = angle;
      break;
    case 4:
      targetAngles.gripper = angle;
      break;
  }
}

function updateRobot() {
  //конвертируем градусы в радианы

  if (parts.base) {
    parts.base.rotation.y = THREE.MathUtils.degToRad(targetAngles.base);
  }
  if (parts.shoulder) {
    parts.shoulder.rotation.x = THREE.MathUtils.degToRad(
      targetAngles.shoulder - 90,
    );
  }
  if (parts.elbow) {
    parts.elbow.rotation.x = THREE.MathUtils.degToRad(targetAngles.elbow - 90);
  }
  if (parts.wrist) {
    parts.wrist.rotation.y = THREE.MathUtils.degToRad(targetAngles.wrist);
  }

  if (parts.finger_r && parts.finger_l) {
    const grip = THREE.MathUtils.degToRad(90 - targetAngles.gripper);
    parts.finger_r.rotation.z = -grip;
    parts.finger_l.rotation.z = grip;
  }
}

function loadModel(scene: THREE.Scene) {
  return new Promise((res, rej) => {
    const loader = new GLTFLoader();
    loader.load(
      MODEL_PATH,
      (gltf) => {
        const model = gltf.scene;
        model.position.set(0, 0, 0);
        model.scale.setScalar(1);

        model.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            const mat = child.material as THREE.MeshStandardMaterial;
            if (mat.color) mat.color.multiplyScalar(0.9);
            mat.metalness = Math.min(mat.metalness * 0.5, 0.3);
            mat.roughness = Math.max(mat.roughness, 0.4);
          }
        });

        scene.add(model);

        parts.base = model.getObjectByName("base");
        parts.shoulder = model.getObjectByName("shoulder");
        parts.elbow = model.getObjectByName("elbow");
        parts.wrist = model.getObjectByName("wrist");
        parts.finger_l = model.getObjectByName("finger_l");
        parts.finger_r = model.getObjectByName("finger_r");

        setupOledScreen(model);

        console.log("ROBOARM parts found:", parts);

        res(model);
      },
      (progress) => {
        const pct = ((progress.loaded / progress.total) * 100).toFixed(0);
        console.log(`Loading model: ${pct}%`);
      },
      (error) => {
        console.error("Failed to load model:", error);
        rej(error);
      },
    );
  });
}

function setupOledScreen(model: THREE.Object3D) {
  const screen = model.getObjectByName(OLED_SCREEN_NAME);

  if (!screen) {
    console.warn(`3D OLED screen mesh "${OLED_SCREEN_NAME}" not found. Add this named mesh to the model to show OLED text and bitmap on the robot.`);
    return;
  }

  if (!(screen instanceof THREE.Mesh)) {
    console.warn(`Object "${OLED_SCREEN_NAME}" exists but is not a mesh.`);
    return;
  }

  oledScreen = screen;
  orientOledScreenUv(oledScreen);
  ensureOledCanvas();

  if (!oledCanvas) return;

  oledTexture = new THREE.CanvasTexture(oledCanvas);
  oledTexture.colorSpace = THREE.SRGBColorSpace;
  oledTexture.magFilter = THREE.NearestFilter;
  oledTexture.minFilter = THREE.NearestFilter;
  oledTexture.wrapS = THREE.ClampToEdgeWrapping;
  oledTexture.wrapT = THREE.ClampToEdgeWrapping;
  oledTexture.flipY = false;

  if (Array.isArray(oledScreen.material)) {
    oledScreen.material.forEach((material) => material.dispose());
  } else if (oledScreen.material) {
    oledScreen.material.dispose();
  }

  oledScreen.material = new THREE.MeshBasicMaterial({
    map: oledTexture,
    toneMapped: false,
  });

  drawOled();
}

function orientOledScreenUv(screen: THREE.Mesh) {
  screen.geometry.computeBoundingBox();
  const box = screen.geometry.boundingBox;
  if (!box) return;

  screen.geometry = screen.geometry.clone();

  const size = new THREE.Vector3();
  box.getSize(size);
  if (size.x <= 0 || size.z <= 0) return;

  const uv = screen.geometry.getAttribute("uv");
  const position = screen.geometry.getAttribute("position");
  if (!(uv instanceof THREE.BufferAttribute) || !(position instanceof THREE.BufferAttribute)) return;

  const useZAsU = Math.abs(size.z * screen.scale.z) > Math.abs(size.x * screen.scale.x);
  const nextUv: number[] = [];

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const u = useZAsU
      ? (z - box.min.z) / size.z
      : (x - box.min.x) / size.x;
    const v = useZAsU
      ? (x - box.min.x) / size.x
      : (z - box.min.z) / size.z;

    nextUv.push(u, 1 - v);
  }

  screen.geometry.setAttribute("uv", new THREE.Float32BufferAttribute(nextUv, 2));
}

function ensureOledCanvas() {
  if (oledCanvas && oledCtx) return;

  oledCanvas = document.createElement("canvas");
  oledCanvas.width = OLED_WIDTH;
  oledCanvas.height = OLED_HEIGHT;
  oledCtx = oledCanvas.getContext("2d");

  if (!oledCtx) {
    console.warn("Unable to create OLED canvas context.");
    return;
  }

  oledCtx.imageSmoothingEnabled = false;
}

function drawOled() {
  ensureOledCanvas();
  if (!oledCtx) return;

  oledCtx.fillStyle = "#000";
  oledCtx.fillRect(0, 0, OLED_WIDTH, OLED_HEIGHT);

  if (oledBitmap) {
    drawBitmapToContext(oledBitmap, oledCtx);
  } else {
    drawTextToContext(oledText, oledCtx);
  }

  if (oledTexture) {
    oledTexture.needsUpdate = true;
  }
}

function drawTextToContext(text: string, ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#fff";
  ctx.font = "10px monospace";
  ctx.textBaseline = "top";

  const lines = wrapOledText(text);
  lines.slice(0, 5).forEach((line, index) => {
    ctx.fillText(line, 4, 4 + index * 12);
  });
}

function wrapOledText(text: string): string[] {
  const maxChars = 20;
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words.length ? words : [""]) {
    if (word.length > maxChars) {
      if (line) {
        lines.push(line);
        line = "";
      }
      for (let i = 0; i < word.length; i += maxChars) {
        lines.push(word.slice(i, i + maxChars));
      }
      continue;
    }

    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }

  if (line) lines.push(line);
  return lines;
}

function drawBitmapToContext(data: Uint8Array, ctx: CanvasRenderingContext2D) {
  const imageData = ctx.createImageData(OLED_WIDTH, OLED_HEIGHT);

  for (let y = 0; y < OLED_HEIGHT; y++) {
    for (let x = 0; x < OLED_WIDTH; x++) {
      const byteIndex = y * (OLED_WIDTH / 8) + Math.floor(x / 8);
      const bit = 7 - (x % 8);
      const on = (data[byteIndex] & (1 << bit)) !== 0;
      const pixelIndex = (y * OLED_WIDTH + x) * 4;
      const value = on ? 255 : 0;

      imageData.data[pixelIndex] = value;
      imageData.data[pixelIndex + 1] = value;
      imageData.data[pixelIndex + 2] = value;
      imageData.data[pixelIndex + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

export function setOledText(text: string) {
  oledText = text || "";
  oledBitmap = null;
  drawOled();
}

export function setOledBitmap(data: Uint8Array) {
  if (data.length !== OLED_WIDTH * OLED_HEIGHT / 8) {
    console.warn(`OLED bitmap must be 1024 bytes, got ${data.length}.`);
    return;
  }

  oledBitmap = data;
  drawOled();
}

export function renderOledPreview(canvas: HTMLCanvasElement) {
  ensureOledCanvas();
  if (!oledCanvas) return;

  canvas.width = OLED_WIDTH;
  canvas.height = OLED_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(oledCanvas, 0, 0);
}

let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let controls: OrbitControls;
let animationId: number;

export async function initViewer3D(container: HTMLElement) {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    50,
    container.clientWidth / container.clientHeight,
    0.1,
    1000,
  );
  camera.position.set(3, 2.5, 3);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
  });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1.5;
  controls.maxDistance = 15;
  controls.target.set(0, 0.5, 0);
  controls.update();

  setupLights();
  setupScene();

  const ro = new ResizeObserver(() => handleResize(container));
  ro.observe(container);

  await loadModel(scene);
  animate();
}

function setupLights() {
  const ambient = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x666666, 1.0);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
  keyLight.position.set(5, 8, 5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, 1.5);
  fillLight.position.set(-5, 4, 2);
  scene.add(fillLight);

  const backLight = new THREE.DirectionalLight(0xffffff, 1.0);
  backLight.position.set(0, 4, -5);
  scene.add(backLight);

  const frontLight = new THREE.DirectionalLight(0xffffff, 1.0);
  frontLight.position.set(0, 2, 5);
  scene.add(frontLight);
}

function setupScene() {
  const gridHelper = new THREE.GridHelper(8, 16, 0x252a3a, 0x1a1e2a);
  scene.add(gridHelper);
}

function animate() {
  animationId = requestAnimationFrame(animate);
  updateRobot();
  controls.update();
  renderer.render(scene, camera);
}

function handleResize(container: HTMLElement) {
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (w === 0 || h === 0) return;

  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

export function disposeViewer3D() {
  cancelAnimationFrame(animationId);
  if (oledTexture) oledTexture.dispose();
  if (oledScreen?.material) {
    if (Array.isArray(oledScreen.material)) {
      oledScreen.material.forEach((material) => material.dispose());
    } else {
      oledScreen.material.dispose();
    }
  }
  renderer.dispose();
  controls.dispose();
  scene.clear();
}
