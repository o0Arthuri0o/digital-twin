import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
const MODEL_PATH = '/roboarm.glb'

let parts: {
  base?: THREE.Object3D
  shoulder?: THREE.Object3D
  elbow?: THREE.Object3D
  wrist?: THREE.Object3D
  finger_r?: THREE.Object3D
  finger_l?: THREE.Object3D
} = {}

const targerAngles = {
  base: 0,
  shoulder: 90,
  elbow: 90,
  wrist: 0,
  gripper: 35,
}

export function setServoAngle(servoIndex: number, angle: number) {
  switch (servoIndex) {
    case 0: targerAngles.base = angle; break
    case 1: targerAngles.shoulder = angle; break
    case 2: targerAngles.elbow = angle; break
    case 3: targerAngles.wrist = angle; break
    case 4: targerAngles.gripper = angle; break
  }
}

function updateRobot() {
  //конвертируем градусы в радианы

  if (parts.base) {
    parts.base.rotation.y = THREE.MathUtils.degToRad(targerAngles.base)
  }
  if (parts.shoulder) {
    parts.shoulder.rotation.x = THREE.MathUtils.degToRad(targerAngles.shoulder - 90)
  }
  if (parts.elbow) {
    parts.elbow.rotation.x = THREE.MathUtils.degToRad(targerAngles.elbow - 90)
  }
  if (parts.wrist) {
    parts.wrist.rotation.y = THREE.MathUtils.degToRad(targerAngles.wrist)
  }

  if (parts.finger_r && parts.finger_l) {
    const grip = THREE.MathUtils.degToRad(targerAngles.gripper - 35)
    parts.finger_r.rotation.z = -grip
    parts.finger_l.rotation.z = grip
  }


}

function loadModel(scene: THREE.Scene) {
  return new Promise((res, rej) => {
    const loader = new GLTFLoader()
    loader.load(
      MODEL_PATH,
      (gltf) => {
        const model = gltf.scene
        model.position.set(0, 0, 0)
        model.scale.setScalar(1)

        model.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            const mat = child.material as THREE.MeshStandardMaterial
            if (mat.color) mat.color.multiplyScalar(0.9)
            mat.metalness = Math.min(mat.metalness * 0.5, 0.3)
            mat.roughness = Math.max(mat.roughness, 0.4)
          }
        })

        scene.add(model)

        parts.base = model.getObjectByName("base")
        parts.shoulder = model.getObjectByName("shoulder")
        parts.elbow = model.getObjectByName("elbow")
        parts.wrist = model.getObjectByName("wrist")
        parts.finger_l = model.getObjectByName("finger_l")
        parts.finger_r = model.getObjectByName("finger_r")

        console.log('ROBOARM parts found:', parts)

        res(model)
      },
      (progress) => {
        const pct = (progress.loaded / progress.total * 100).toFixed(0)
        console.log(`Loading model: ${pct}%`)
      },
      (error) => {
        console.error('Failed to load model:', error)
        rej(error)
      }
    )
  })
}

let renderer: THREE.WebGLRenderer
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let controls: OrbitControls
let animationId: number

export async function initViewer3D(container: HTMLElement) {
  scene = new THREE.Scene()

  camera = new THREE.PerspectiveCamera(
    50,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  )
  camera.position.set(3, 2.5, 3)

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
  })
  renderer.setSize(container.clientWidth, container.clientHeight)
  container.appendChild(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 1.5
  controls.maxDistance = 15
  controls.target.set(0, 0.5, 0)
  controls.update()

  setupLights()
  setupScene()


  const ro = new ResizeObserver(() => handleResize(container))
  ro.observe(container)

  await loadModel(scene)
  animate()
}

function setupLights() {
  const ambient = new THREE.AmbientLight(0xffffff, 0.8)
  scene.add(ambient)

  const hemi = new THREE.HemisphereLight(0xffffff, 0x666666, 1.0)
  scene.add(hemi)

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.5)
  keyLight.position.set(5, 8, 5)
  keyLight.castShadow = true
  keyLight.shadow.mapSize.set(1024, 1024)
  scene.add(keyLight)

  const fillLight = new THREE.DirectionalLight(0xffffff, 1.5)
  fillLight.position.set(-5, 4, 2)
  scene.add(fillLight)

  const backLight = new THREE.DirectionalLight(0xffffff, 1.0)
  backLight.position.set(0, 4, -5)
  scene.add(backLight)

  const frontLight = new THREE.DirectionalLight(0xffffff, 1.0)
  frontLight.position.set(0, 2, 5)
  scene.add(frontLight)
}

function setupScene() {
  const gridHelper = new THREE.GridHelper(8, 16, 0x252A3A, 0x1A1E2A)
  scene.add(gridHelper)
}

function animate() {
  animationId = requestAnimationFrame(animate)
  updateRobot()
  controls.update()
  renderer.render(scene, camera)
}

function handleResize(container: HTMLElement) {
  const w = container.clientWidth
  const h = container.clientHeight
  if (w === 0 || h === 0) return

  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
}

export function disposeViewer3D() {
  cancelAnimationFrame(animationId)
  renderer.dispose()
  controls.dispose()
  scene.clear()
}
