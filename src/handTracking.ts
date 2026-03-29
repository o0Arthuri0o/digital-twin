/**
 * Hand Tracking Module
 *
 * Трекинг рук через веб-камеру с использованием MediaPipe Hands.
 *
 * Landmarks (21 точка на руку):
 *   0: WRIST
 *   1-4: THUMB (CMC, MCP, IP, TIP)
 *   5-8: INDEX_FINGER (MCP, PIP, DIP, TIP)
 *   9-12: MIDDLE_FINGER (MCP, PIP, DIP, TIP)
 *   13-16: RING_FINGER (MCP, PIP, DIP, TIP)
 *   17-20: PINKY (MCP, PIP, DIP, TIP)
 */

import { Hands, type Results } from '@mediapipe/hands'

export interface HandTrackingCallbacks {
  onAnglesUpdate: (angles: number[]) => void
  onStatusChange: (status: 'idle' | 'detecting' | 'tracking') => void
  onLandmarks: (landmarks: HandLandmark[] | null) => void
}

export interface HandLandmark {
  x: number
  y: number
  z: number
}

export interface HandTrackerInstance {
  start: () => Promise<void>
  stop: () => void
}

export function initHandTracking(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  callbacks: HandTrackingCallbacks
): HandTrackerInstance {
  let stream: MediaStream | null = null
  let isRunning = false
  let animationId: number | null = null
  let hands: Hands | null = null

  const ctx = canvas.getContext('2d')

  // Сглаживание (EMA - exponential moving average)
  const smoothing = 0.3  // 0 = без сглаживания, 1 = максимальное сглаживание
  let smoothedAngles: number[] | null = null

  const CONNECTIONS: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [0, 9], [9, 10], [10, 11], [11, 12],
    [0, 13], [13, 14], [14, 15], [15, 16],
    [0, 17], [17, 18], [18, 19], [19, 20],
    [5, 9], [9, 13], [13, 17]
  ]

  function distance(a: HandLandmark, b: HandLandmark): number {
    return Math.sqrt(
      Math.pow(a.x - b.x, 2) +
      Math.pow(a.y - b.y, 2) +
      Math.pow(a.z - b.z, 2)
    )
  }

  function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val))
  }

  /**
   * ПРОСТАЯ МОДЕЛЬ УПРАВЛЕНИЯ:
   *
   * S1 (База)     — двигай руку ВЛЕВО/ВПРАВО → робот поворачивается
   * S2 (Плечо)    — двигай руку ВВЕРХ/ВНИЗ → плечо робота поднимается/опускается
   * S3 (Локоть)   — СОЖМИ КУЛАК → локоть сгибается, РАЗОЖМИ → разгибается
   * S4 (Запястье) — НАКЛОНИ КИСТЬ влево/вправо → запястье робота вращается
   * S5 (Захват)   — ЩИПОК (большой + указательный) → захват сжимается/разжимается
   */
  function calculateAngles(landmarks: HandLandmark[]): number[] {
    const wrist = landmarks[0]
    const thumbTip = landmarks[4]
    const indexTip = landmarks[8]
    const middleTip = landmarks[12]
    const ringTip = landmarks[16]
    const pinkyTip = landmarks[20]
    const indexMcp = landmarks[5]
    const pinkyMcp = landmarks[17]

    // ═══ S1: БАЗА — горизонтальное положение руки ═══
    // Рука слева (x≈0.2) → 180°, рука справа (x≈0.8) → 0°
    const baseNorm = clamp((wrist.x - 0.2) / 0.6, 0, 1)
    const base = Math.round((1 - baseNorm) * 180)

    // ═══ S2: ПЛЕЧО — вертикальное положение руки ═══
    // Рука вверху (y≈0.2) → 180°, рука внизу (y≈0.8) → 0°
    const shoulderNorm = clamp((wrist.y - 0.2) / 0.6, 0, 1)
    const shoulder = Math.round((1 - shoulderNorm) * 180)

    // ═══ S3: ЛОКОТЬ — сжатие кулака ═══
    // Измеряем среднее расстояние от кончиков пальцев до запястья
    // Кулак сжат → пальцы близко к запястью → локоть согнут (180°)
    // Кулак разжат → пальцы далеко → локоть разогнут (0°)
    const avgFingerDist = (
      distance(middleTip, wrist) +
      distance(ringTip, wrist) +
      distance(pinkyTip, wrist)
    ) / 3
    // ~0.15 = кулак сжат, ~0.35 = пальцы выпрямлены
    const fistNorm = clamp((avgFingerDist - 0.15) / 0.2, 0, 1)
    const elbow = Math.round((1 - fistNorm) * 180)

    // ═══ S4: ЗАПЯСТЬЕ — наклон кисти влево/вправо ═══
    // Используем угол между указательным и мизинцем относительно горизонта
    const palmTilt = indexMcp.y - pinkyMcp.y
    // palmTilt > 0 → кисть наклонена вправо, < 0 → влево
    const wristNorm = clamp((palmTilt + 0.15) / 0.3, 0, 1)
    const wristAngle = Math.round(wristNorm * 180)

    // ═══ S5: ЗАХВАТ — щипок (pinch) ═══
    // Расстояние между большим и указательным пальцем
    const pinchDist = distance(thumbTip, indexTip)
    // ~0.04 = пальцы касаются (захват закрыт), ~0.15 = разведены (захват открыт)
    const pinchNorm = clamp((pinchDist - 0.04) / 0.11, 0, 1)
    const gripper = Math.round(35 + pinchNorm * 55)  // 35° закрыт, 90° открыт

    return [base, shoulder, elbow, wristAngle, gripper]
  }

  function drawSkeleton(landmarks: HandLandmark[]): void {
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Линии соединений
    ctx.strokeStyle = '#22D3EE'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'

    CONNECTIONS.forEach(([i, j]) => {
      const a = landmarks[i]
      const b = landmarks[j]
      ctx.beginPath()
      ctx.moveTo(a.x * canvas.width, a.y * canvas.height)
      ctx.lineTo(b.x * canvas.width, b.y * canvas.height)
      ctx.stroke()
    })

    // Точки
    landmarks.forEach((point, idx) => {
      const x = point.x * canvas.width
      const y = point.y * canvas.height

      // Кончики пальцев выделяем
      const isTip = [4, 8, 12, 16, 20].includes(idx)
      const radius = isTip ? 6 : 4

      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)

      if (isTip) {
        ctx.fillStyle = '#F59E0B'
        ctx.fill()
        ctx.strokeStyle = '#FBBF24'
        ctx.lineWidth = 2
        ctx.stroke()
      } else if (idx === 0) {
        // Запястье
        ctx.fillStyle = '#EF4444'
        ctx.fill()
      } else {
        ctx.fillStyle = '#FBBF24'
        ctx.fill()
      }
    })

    // Визуализация pinch (линия между большим и указательным)
    const thumbTip = landmarks[4]
    const indexTip = landmarks[8]
    const pinchDist = distance(thumbTip, indexTip)

    ctx.beginPath()
    ctx.moveTo(thumbTip.x * canvas.width, thumbTip.y * canvas.height)
    ctx.lineTo(indexTip.x * canvas.width, indexTip.y * canvas.height)
    ctx.strokeStyle = pinchDist < 0.1 ? '#22C55E' : '#F97316'
    ctx.lineWidth = pinchDist < 0.1 ? 4 : 2
    ctx.stroke()
  }

  function processResults(results: Results): void {
    if (!isRunning) return

    if (!results.multiHandLandmarks?.length) {
      callbacks.onStatusChange('detecting')
      callbacks.onLandmarks(null)
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
      return
    }

    callbacks.onStatusChange('tracking')
    const landmarks = results.multiHandLandmarks[0] as HandLandmark[]
    callbacks.onLandmarks(landmarks)

    const rawAngles = calculateAngles(landmarks)

    // Применяем сглаживание для плавности
    if (smoothedAngles === null) {
      smoothedAngles = [...rawAngles]
    } else {
      smoothedAngles = smoothedAngles.map((prev, i) =>
        Math.round(prev * smoothing + rawAngles[i] * (1 - smoothing))
      )
    }

    callbacks.onAnglesUpdate(smoothedAngles)

    drawSkeleton(landmarks)
  }

  async function start(): Promise<void> {
    if (isRunning) return

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        }
      })

      video.srcObject = stream
      await video.play()

      canvas.width = video.videoWidth || 640
      canvas.height = video.videoHeight || 480

      // Инициализация MediaPipe Hands
      hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      })

      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5
      })

      hands.onResults(processResults)

      isRunning = true
      callbacks.onStatusChange('detecting')

      processFrame()

    } catch (err) {
      console.error('Failed to start hand tracking:', err)
      throw err
    }
  }

  async function processFrame(): Promise<void> {
    if (!isRunning || !hands) return

    try {
      await hands.send({ image: video })
    } catch (err) {
      console.error('MediaPipe error:', err)
    }

    animationId = requestAnimationFrame(processFrame)
  }

  function stop(): void {
    isRunning = false

    if (animationId) {
      cancelAnimationFrame(animationId)
      animationId = null
    }

    if (hands) {
      hands.close()
      hands = null
    }

    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      stream = null
    }

    video.srcObject = null

    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }

    callbacks.onStatusChange('idle')
    callbacks.onLandmarks(null)
    smoothedAngles = null
  }

  return { start, stop }
}
