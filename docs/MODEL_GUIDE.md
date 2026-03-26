# Подготовка 3D-модели роборуки для управления из Three.js

> Гайд описывает полный пайплайн: от структуры модели в Blender до программного управления суставами в Three.js.

---

## Содержание

1. [Концепция: как это работает](#1-концепция-как-это-работает)
2. [Подготовка модели в Blender](#2-подготовка-модели-в-blender)
3. [Экспорт в glTF/GLB](#3-экспорт-в-gltfglb)
4. [Загрузка модели в Three.js](#4-загрузка-модели-в-threejs)
5. [Поиск частей модели по имени](#5-поиск-частей-модели-по-имени)
6. [Программное вращение суставов](#6-программное-вращение-суставов)
7. [Привязка к UI-слайдерам](#7-привязка-к-ui-слайдерам)
8. [Два подхода: иерархия объектов vs. арматура](#8-два-подхода-иерархия-объектов-vs-арматура)
9. [Чеклист перед экспортом](#9-чеклист-перед-экспортом)
10. [Частые ошибки](#10-частые-ошибки)

---

## 1. Концепция: как это работает

Принцип управления роборукой в 3D — **иерархия parent→child**. Каждый сегмент руки является дочерним по отношению к предыдущему. Когда поворачивается «плечо», с ним автоматически двигаются «локоть», «запястье» и «захват» — точно как в реальной руке.

```
База (base)
 └─ Плечо (shoulder)
     └─ Локоть (elbow)
         └─ Запястье (wrist)
             └─ Захват (gripper)
                 ├─ Палец L (finger_l)
                 └─ Палец R (finger_r)
```

Three.js поддерживает эту иерархию нативно: `Object3D` может содержать дочерние `Object3D`, и трансформации (позиция, поворот, масштаб) наследуются по цепочке.

---

## 2. Подготовка модели в Blender

### 2.1. Разделение на отдельные объекты

Каждая подвижная часть руки должна быть **отдельным объектом** (не частью единого меша).

**Порядок действий:**

1. Открой модель в Blender
2. Перейди в **Edit Mode** (`Tab`)
3. Выдели вершины, принадлежащие одному сегменту (например, плечу)
4. `P` → **Selection** — отделить в отдельный объект
5. Повтори для каждого сегмента

**Итого должно получиться 6–7 объектов:**
- `base` — неподвижная платформа
- `shoulder` — плечевой сегмент
- `elbow` — локтевой сегмент
- `wrist` — запястье
- `gripper_base` — основание захвата
- `finger_l`, `finger_r` — пальцы захвата

### 2.2. Именование объектов

**Критически важно:** имена объектов в Blender становятся именами нод в glTF, по которым Three.js находит части модели через `getObjectByName()`.

Правила именования:
- Используй **snake_case** без пробелов и спецсимволов
- Имена должны быть **уникальными** в пределах сцены
- Избегай кириллицы — используй латиницу
- Не начинай имя с цифры

```
✅  arm_base, arm_shoulder, arm_elbow, arm_wrist, arm_gripper
❌  База, Arm Shoulder, 1_elbow, arm/wrist
```

> **Нюанс:** glTF-экспортёр Blender использует имя **объекта** (Object Name), а не имя **меша** (Mesh Data Name). Убедись, что именно Object Name задан правильно — это видно в Outliner панели.

### 2.3. Установка Origin Point (точки вращения)

Каждый объект вращается вокруг своего **Origin** (оранжевая точка). Для каждого сустава origin должен стоять точно в центре шарнира.

**Как выставить:**

1. Выдели объект в Object Mode
2. Перейди в **Edit Mode** (`Tab`)
3. Выдели одну вершину в центре шарнира
4. `Shift+S` → **Cursor to Selected**
5. Вернись в **Object Mode** (`Tab`)
6. **Right Click** → **Set Origin → Origin to 3D Cursor**

Повтори для каждого подвижного сегмента.

### 2.4. Построение иерархии (parent→child)

Связать объекты в цепочку parent→child:

1. Выдели **дочерний** объект (например, `shoulder`)
2. Затем `Shift+Click` на **родительский** (например, `base`) — он будет выделен последним (активный)
3. `Ctrl+P` → **Object (Keep Transform)**

Построй цепочку снизу вверх:

```
base
 └─ shoulder     (parent: base)
     └─ elbow    (parent: shoulder)
         └─ wrist (parent: elbow)
             └─ gripper_base (parent: wrist)
                 ├─ finger_l  (parent: gripper_base)
                 └─ finger_r  (parent: gripper_base)
```

**Проверка:** в Outliner включи режим **Blender File** или **Scenes** — должно отображаться дерево вложенности.

### 2.5. Проверка осей вращения

Для каждого сустава определи, вокруг какой оси он вращается в реальности:

| Сустав | Ось вращения (типично) | Описание |
|--------|----------------------|-----------|
| Base | Y (вертикальная) | Поворот платформы |
| Shoulder | X или Z (горизонтальная) | Наклон плеча вперёд-назад |
| Elbow | X или Z | Сгиб локтя |
| Wrist | X или Z | Наклон запястья |
| Gripper | Z или X | Открытие/закрытие пальцев |

Убедись, что оси объектов ориентированы логично. Если нет — **Apply Rotation** (`Ctrl+A` → Rotation) перед экспортом.

---

## 3. Экспорт в glTF/GLB

### 3.1. Настройки экспорта

`File → Export → glTF 2.0 (.glb/.gltf)`

**Рекомендуемые настройки:**

| Параметр | Значение | Зачем |
|----------|----------|-------|
| Format | GLB (Binary) | Один файл, быстрая загрузка |
| Include → Selected Objects | Off (все) | Экспортировать всю сцену |
| Transform → Y Up | ✅ | Three.js использует Y-up |
| Geometry → Apply Modifiers | ✅ | Запечь модификаторы |
| Geometry → UVs | ✅ | Текстурные координаты |
| Geometry → Normals | ✅ | Для корректного освещения |
| Geometry → Vertex Colors | По необходимости | Если есть вертексные цвета |
| Animation | ❌ (выключить) | Для нас анимация программная |

### 3.2. Куда положить файл

В нашем проекте статические файлы кладутся в директорию `public/`:

```
digital-twin/
  public/
    models/
      roboarm.glb     ← сюда
  src/
    viewer3d.ts
```

Vite раздаёт содержимое `public/` от корня, поэтому путь в коде будет `/models/roboarm.glb`.

### 3.3. Проверка экспорта

Перед интеграцией проверь модель в онлайн-просмотрщике:

- https://gltf-viewer.donmccurdy.com/
- https://sandbox.babylonjs.com/

Убедись:
- Иерархия отображается корректно (дерево объектов)
- Имена объектов сохранились
- Модель ориентирована правильно (Y — вверх)

---

## 4. Загрузка модели в Three.js

### 4.1. Базовая загрузка (GLTFLoader)

```typescript
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const loader = new GLTFLoader()

loader.load(
  '/models/roboarm.glb',
  (gltf) => {
    const model = gltf.scene
    scene.add(model)
  },
  (progress) => {
    console.log(`Загрузка: ${(progress.loaded / progress.total * 100).toFixed(0)}%`)
  },
  (error) => {
    console.error('Ошибка загрузки:', error)
  }
)
```

### 4.2. С Draco-компрессией (для больших моделей)

Если модель сжата Draco (уменьшает размер в 5–10 раз):

```typescript
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')

const loader = new GLTFLoader()
loader.setDRACOLoader(dracoLoader)

loader.load('/models/roboarm.glb', (gltf) => {
  scene.add(gltf.scene)
})
```

### 4.3. Async/await вариант

```typescript
async function loadModel(scene: THREE.Scene): Promise<THREE.Group> {
  const loader = new GLTFLoader()

  return new Promise((resolve, reject) => {
    loader.load(
      '/models/roboarm.glb',
      (gltf) => {
        const model = gltf.scene
        scene.add(model)
        resolve(model)
      },
      undefined,
      reject
    )
  })
}
```

---

## 5. Поиск частей модели по имени

### 5.1. `getObjectByName()` — поиск конкретного объекта

```typescript
const model = gltf.scene

const base     = model.getObjectByName('arm_base')
const shoulder = model.getObjectByName('arm_shoulder')
const elbow    = model.getObjectByName('arm_elbow')
const wrist    = model.getObjectByName('arm_wrist')
const gripper  = model.getObjectByName('arm_gripper')
```

Метод ищет **рекурсивно** по всему дереву потомков. Возвращает `Object3D | undefined`.

### 5.2. `traverse()` — обход всего дерева

Полезен для отладки и массового применения свойств:

```typescript
model.traverse((child) => {
  console.log(child.name, child.type)

  if (child instanceof THREE.Mesh) {
    child.castShadow = true
    child.receiveShadow = true
  }
})
```

Пример вывода:

```
arm_root        Group
arm_base        Mesh
arm_shoulder    Mesh
arm_elbow       Mesh
arm_wrist       Mesh
arm_gripper     Group
finger_l        Mesh
finger_r        Mesh
```

### 5.3. Сохранение ссылок в объект

```typescript
interface ArmJoints {
  base: THREE.Object3D
  shoulder: THREE.Object3D
  elbow: THREE.Object3D
  wrist: THREE.Object3D
  gripper: THREE.Object3D
}

function findJoints(model: THREE.Object3D): ArmJoints | null {
  const names = ['arm_base', 'arm_shoulder', 'arm_elbow', 'arm_wrist', 'arm_gripper']
  const joints: Record<string, THREE.Object3D> = {}

  for (const name of names) {
    const obj = model.getObjectByName(name)
    if (!obj) {
      console.error(`Joint "${name}" not found in model`)
      return null
    }
    const key = name.replace('arm_', '')
    joints[key] = obj
  }

  return joints as unknown as ArmJoints
}
```

---

## 6. Программное вращение суставов

### 6.1. Прямое задание угла

```typescript
const shoulder = model.getObjectByName('arm_shoulder')!

// Повернуть плечо на 45° вокруг оси X
shoulder.rotation.x = THREE.MathUtils.degToRad(45)
```

### 6.2. Выбор оси вращения

Ось зависит от ориентации модели в Blender. Типичные маппинги:

```typescript
// База вращается горизонтально (вокруг Y)
joints.base.rotation.y = THREE.MathUtils.degToRad(angle)

// Плечо наклоняется вперёд-назад (вокруг X или Z)
joints.shoulder.rotation.x = THREE.MathUtils.degToRad(angle)

// Локоть сгибается
joints.elbow.rotation.x = THREE.MathUtils.degToRad(angle)

// Запястье
joints.wrist.rotation.x = THREE.MathUtils.degToRad(angle)

// Захват — симметрично разводим пальцы
joints.finger_l.rotation.z = THREE.MathUtils.degToRad(openAngle)
joints.finger_r.rotation.z = THREE.MathUtils.degToRad(-openAngle)
```

### 6.3. Плавная анимация (lerp)

Для плавного перехода между углами:

```typescript
function lerpAngle(
  joint: THREE.Object3D,
  axis: 'x' | 'y' | 'z',
  targetDeg: number,
  speed: number = 0.1
) {
  const targetRad = THREE.MathUtils.degToRad(targetDeg)
  joint.rotation[axis] = THREE.MathUtils.lerp(
    joint.rotation[axis],
    targetRad,
    speed
  )
}

// В animation loop:
function animate() {
  requestAnimationFrame(animate)

  lerpAngle(joints.shoulder, 'x', targetAngles.shoulder, 0.08)
  lerpAngle(joints.elbow, 'x', targetAngles.elbow, 0.08)

  renderer.render(scene, camera)
}
```

### 6.4. Ограничение диапазона (clamp)

```typescript
function setJointAngle(
  joint: THREE.Object3D,
  axis: 'x' | 'y' | 'z',
  angleDeg: number,
  minDeg: number,
  maxDeg: number
) {
  const clamped = THREE.MathUtils.clamp(angleDeg, minDeg, maxDeg)
  joint.rotation[axis] = THREE.MathUtils.degToRad(clamped)
}

// Пример: плечо двигается от 0° до 180°
setJointAngle(joints.shoulder, 'x', sliderValue, 0, 180)
```

---

## 7. Привязка к UI-слайдерам

Абстрактный пример связки слайдеров интерфейса с 3D-моделью:

```typescript
// Конфигурация: маппинг серво → сустав → ось
const JOINT_MAP = [
  { name: 'arm_base',     axis: 'y' as const, min: 0, max: 180, offset: -90 },
  { name: 'arm_shoulder',  axis: 'x' as const, min: 0, max: 180, offset: -90 },
  { name: 'arm_elbow',     axis: 'x' as const, min: 0, max: 180, offset: 0   },
  { name: 'arm_wrist',     axis: 'x' as const, min: 0, max: 180, offset: 0   },
  { name: 'arm_gripper',   axis: 'z' as const, min: 35, max: 90, offset: 0   },
] as const

// Вызывается при изменении слайдера
function onServoChange(servoIndex: number, angleDeg: number) {
  const config = JOINT_MAP[servoIndex]
  const joint = model.getObjectByName(config.name)
  if (!joint) return

  const adjusted = angleDeg + config.offset
  const clamped = THREE.MathUtils.clamp(adjusted, config.min, config.max)
  targetAngles[servoIndex] = clamped
}

// В animation loop — плавная интерполяция
function updateJoints() {
  JOINT_MAP.forEach((config, i) => {
    const joint = joints[i]
    if (!joint) return

    const targetRad = THREE.MathUtils.degToRad(targetAngles[i])
    joint.rotation[config.axis] = THREE.MathUtils.lerp(
      joint.rotation[config.axis],
      targetRad,
      0.1
    )
  })
}
```

> **Про `offset`:** серво-мотор Arduino отдаёт 0–180°, но в 3D-модели «нулевое положение» может не совпадать с 0° сервопривода. Offset компенсирует эту разницу — подбирается экспериментально.

---

## 8. Два подхода: иерархия объектов vs. арматура

### Подход A: Иерархия Object3D (рекомендуется для нашего проекта)

Каждый сегмент — отдельный объект, связанный parent→child.

```
✅  Простое программное управление: joint.rotation.x = angle
✅  Нет лишних абстракций — Object3D + Mesh
✅  Прямое соответствие реальной механике
✅  Легче дебажить
❌  Нет плавных деформаций между сегментами (но для робота это и не нужно)
```

### Подход B: Арматура (Armature/Skeleton)

Единый меш с костями внутри. Меш деформируется при повороте костей.

```
✅  Плавные деформации (скиннинг)
✅  Один объект вместо множества
✅  Поддержка IK (inverse kinematics) через BVH
❌  Сложнее программное управление
❌  Имена костей могут меняться при экспорте (добавляется префикс Armature_)
❌  Для жёстких роботов деформации не нужны
```

**Управление костями (если выбран подход B):**

```typescript
loader.load('/models/roboarm_rigged.glb', (gltf) => {
  const model = gltf.scene
  scene.add(model)

  model.traverse((child) => {
    if (child instanceof THREE.SkinnedMesh) {
      const skeleton = child.skeleton
      console.log('Bones:', skeleton.bones.map(b => b.name))

      // Доступ к кости по имени
      const shoulderBone = skeleton.bones.find(b => b.name === 'shoulder')
      if (shoulderBone) {
        shoulderBone.rotation.x = THREE.MathUtils.degToRad(45)
      }
    }
  })
})
```

**Для нашего проекта рекомендуется Подход A** — иерархия отдельных объектов. Робот-манипулятор состоит из жёстких сегментов, никакие деформации между ними не нужны.

---

## 9. Чеклист перед экспортом

- [ ] Каждый подвижный сегмент — **отдельный объект** в Blender
- [ ] Объекты названы на **латинице**, **snake_case**, **без пробелов**
- [ ] **Origin** каждого объекта стоит в центре шарнира (точке вращения)
- [ ] Иерархия **parent→child** построена (`Ctrl+P → Object Keep Transform`)
- [ ] **Apply** всех трансформаций: `Ctrl+A` → All Transforms
- [ ] Проверена ось вращения каждого сустава (соответствует реальному серво)
- [ ] Экспорт: формат **GLB**, включены **Normals**, **UVs**, Y Up
- [ ] Модель проверена в [glTF Viewer](https://gltf-viewer.donmccurdy.com/)
- [ ] В Three.js `getObjectByName()` возвращает все ожидаемые суставы

---

## 10. Частые ошибки

### `getObjectByName()` возвращает `undefined`

- Имя в Blender содержало пробел → glTF экспортёр заменил на `_`
- Перепутаны Object Name и Mesh Data Name (в Blender это разные поля)
- Используй `traverse()` + `console.log(child.name)` чтобы увидеть реальные имена

### Объект вращается не вокруг той оси

- Origin стоит не в центре шарнира → пересетить через 3D Cursor
- Не применены трансформации → `Ctrl+A` → All Transforms в Blender
- Blender и Three.js используют разные системы координат: Blender = Z-up, Three.js = Y-up. Экспортёр glTF конвертирует автоматически, но оси поворота меняются.

### Дочерние объекты «улетают» при повороте родителя

- При создании parent→child не использовался **Keep Transform**
- Origin дочернего объекта стоит далеко от шарнира

### Модель загрузилась, но чёрная / без текстур

- Материалы не Principled BSDF → glTF поддерживает только PBR-материалы
- Текстуры не запакованы (`File → External Data → Pack Resources`)
- Нет освещения в сцене Three.js

### Имена костей/объектов изменились после загрузки

- GLTFLoader дедуплицирует одинаковые имена (добавляет `_1`, `_2`)
- Арматурный экспорт может добавить префикс `Armature_`
- Пробелы заменяются на `_`, спецсимволы удаляются

---

*Этот гайд актуален для Three.js r182+ и Blender 4.x с встроенным glTF-экспортёром.*
