import './style.css'
import { initViewer3D, renderOledPreview, setOledBitmap, setOledText, setServoAngle } from './viewer3d'
import type { HandTrackerInstance, HandTrackingCallbacks } from './handTracking'
import * as serial from './serial'

const SERVO_CONFIG = [
  { id: 'A', min: 0, max: 180, initial: 90 },
  { id: 'B', min: 0, max: 180, initial: 90 },
  { id: 'C', min: 0, max: 180, initial: 90 },
  { id: 'D', min: 0, max: 180, initial: 90 },
  { id: 'E', min: 35, max: 90, initial: 90 },
] as const

const values: number[] = SERVO_CONFIG.map(s => s.initial)
let autoSend = false
let oledAnglesMode = false
let lastReceivedLine = ''
let pendingServoPacket: string | null = null
let servoSendTimer: ReturnType<typeof setTimeout> | null = null
let lastSentServoPacket = ''

const DEFAULT_OLED_TEXT = 'Khusainov AA 4241v'
const SERVO_SEND_DEBOUNCE_MS = 80

function $(sel: string) { return document.querySelector(sel) }
function $$(sel: string) { return document.querySelectorAll(sel) }

// ─── Track fill for sliders ─────────────────────────
function updateTrackFill(index: number) {
  const slider = $(`#s${index}`) as HTMLInputElement | null
  const fill = $(`#fill${index}`) as HTMLElement | null
  if (!slider || !fill) return

  const min = +slider.min
  const max = +slider.max
  const val = +slider.value
  const pct = ((val - min) / (max - min)) * 100
  fill.style.width = `${pct}%`
}

// ─── Packet preview ─────────────────────────────────
function updatePacketPreview() {
  const preview = $('#packetPreview')
  if (!preview) return
  const pkt = SERVO_CONFIG.map((s, i) => s.id + values[i]).join('') + ';'
  preview.textContent = pkt
}

// ─── Log entry (UI only — demo data) ───────────────
function addLogEntry(type: 'tx' | 'rx' | 'sys' | 'err', msg: string) {
  const log = $('#monitorLog')
  if (!log) return

  const now = new Date()
  const time = now.toTimeString().slice(0, 8)
  const prefix = type === 'tx' ? '→ ' : type === 'rx' ? '← ' : ''

  const entry = document.createElement('div')
  entry.className = `log-entry log-entry--${type}`
  entry.innerHTML = `
    <span class="log-entry__time">${time}</span>
    <span class="log-entry__badge log-entry__badge--${type}">${type.toUpperCase()}</span>
    <span class="log-entry__msg">${prefix}${escapeHtml(msg)}</span>
  `
  log.appendChild(entry)
  log.scrollTop = log.scrollHeight

  while (log.children.length > 200) {
    log.removeChild(log.firstChild!)
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function extractOledText(input: string): string | null {
  const firstIndex = input.indexOf('%')
  if (firstIndex === -1) return null

  const secondIndex = input.indexOf('%', firstIndex + 1)
  if (secondIndex === -1) return null

  return input.slice(firstIndex + 1, secondIndex)
}

function updateOledPreview() {
  const preview = $('#oledPreview') as HTMLCanvasElement | null
  if (preview) renderOledPreview(preview)
}

function showOledText(text: string) {
  setOledText(text)
  updateOledPreview()
}

function showOledBitmap(data: Uint8Array) {
  setOledBitmap(data)
  updateOledPreview()
}

function buildAnglesText(): string {
  return SERVO_CONFIG.map((s, i) => `${s.id}${values[i]}`).join(' ')
}

function updateOledAnglesPreview() {
  if (oledAnglesMode) {
    showOledText(buildAnglesText())
  }
}

function clampServoValue(index: number, value: number): number {
  const config = SERVO_CONFIG[index]
  if (!config) return value
  return Math.max(config.min, Math.min(config.max, value))
}

// ─── Initialize sliders ─────────────────────────────
function initSliders() {
  $$('.servo__slider').forEach(el => {
    const slider = el as HTMLInputElement
    const index = +(slider.dataset.index ?? 0)
    slider.value = String(values[index])

    const valueEl = $(`#v${index}`)
    if (valueEl) {
      const numEl = valueEl.querySelector('.servo__number')
      if (numEl) numEl.textContent = slider.value
    }

    updateTrackFill(index)
    setServoAngle(index, values[index])

    slider.addEventListener('input', () => {
      values[index] = +slider.value
      const valueEl = $(`#v${index}`)
      if (valueEl) {
        const numEl = valueEl.querySelector('.servo__number')
        if (numEl) numEl.textContent = slider.value
      }
      updateTrackFill(index)
      updatePacketPreview()
      setServoAngle(index, values[index])
      updateOledAnglesPreview()

      scheduleServoSend()
    })
  })
}

function buildPacket(): string {
  return SERVO_CONFIG.map((s, i) => s.id + values[i]).join('') + ';'
}

async function sendServoPacket(packet = buildPacket(), force = false) {
  if (!serial.isConnected()) return
  if (!force && packet === lastSentServoPacket) return

  try {
    await serial.send(packet)
    lastSentServoPacket = packet
    addLogEntry('tx', packet)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Ошибка отправки'
    addLogEntry('err', msg)
  }
}

function scheduleServoSend() {
  if (!autoSend || !serial.isConnected()) return

  pendingServoPacket = buildPacket()
  if (servoSendTimer) return

  servoSendTimer = setTimeout(() => {
    const packet = pendingServoPacket
    pendingServoPacket = null
    servoSendTimer = null
    if (packet) sendServoPacket(packet)
  }, SERVO_SEND_DEBOUNCE_MS)
}

function cancelPendingServoSend() {
  pendingServoPacket = null
  if (servoSendTimer) {
    clearTimeout(servoSendTimer)
    servoSendTimer = null
  }
}

// ─── Toggle auto-send ───────────────────────────────
function initToggle() {
  const toggle = $('#autoToggle')
  if (!toggle) return

  toggle.addEventListener('click', () => {
    autoSend = !autoSend
    toggle.classList.toggle('on', autoSend)
    toggle.setAttribute('aria-checked', String(autoSend))
    addLogEntry('sys', autoSend ? 'Авто-отправка включена' : 'Авто-отправка выключена')
    if (autoSend) scheduleServoSend()
    else cancelPendingServoSend()
  })
}

// ─── Connect / Disconnect buttons ───────────────────
function initConnectionUI() {
  const btnConnect = $('#btnConnect') as HTMLButtonElement | null
  const btnDisconnect = $('#btnDisconnect') as HTMLButtonElement | null
  const btnSend = $('#btnSend') as HTMLButtonElement | null
  const baudSelect = $('#baudRate') as HTMLSelectElement | null
  const indicator = $('#statusIndicator')
  const statusText = $('#statusText')

  if (!serial.isSupported()) {
    addLogEntry('err', 'Web Serial API не поддерживается. Используйте Chrome или Edge.')
    if (btnConnect) btnConnect.disabled = true
    return
  }

  serial.onReceive((data) => {
    lastReceivedLine = data
    addLogEntry('rx', data)

    const oledText = extractOledText(data)
    if (oledText !== null) {
      showOledText(oledText)
    }
  })

  serial.onBitmapReceive((data) => {
    showOledBitmap(data)
    addLogEntry('rx', `OLED bitmap received: ${data.length} bytes`)
  })

  serial.onDisconnect(() => {
    cancelPendingServoSend()
    lastSentServoPacket = ''
    setOledAnglesMode(false)
    setConnectedUI(false)
    addLogEntry('sys', 'Устройство отключено')
  })

  btnConnect?.addEventListener('click', async () => {
    const baudRate = baudSelect ? parseInt(baudSelect.value, 10) : 9600

    btnConnect.disabled = true
    btnConnect.textContent = 'Подключение...'

    try {
      await serial.connect(baudRate)
      lastSentServoPacket = ''
      setConnectedUI(true)
      addLogEntry('sys', `Подключено (${baudRate} baud)`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка подключения'
      addLogEntry('err', msg)
      btnConnect.disabled = false
      btnConnect.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2v5M5 4l3 3 3-3M2 10v2a2 2 0 002 2h8a2 2 0 002-2v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        Подключить
      `
    }
  })

  btnDisconnect?.addEventListener('click', async () => {
    cancelPendingServoSend()
    await serial.disconnect()
    lastSentServoPacket = ''
    setOledAnglesMode(false)
    setConnectedUI(false)
    addLogEntry('sys', 'Отключено')
  })

  btnSend?.addEventListener('click', async () => {
    if (!serial.isConnected()) return

    cancelPendingServoSend()
    await sendServoPacket(buildPacket(), true)
  })

  function setConnectedUI(connected: boolean) {
    if (btnConnect) {
      btnConnect.style.display = connected ? 'none' : ''
      btnConnect.disabled = false
      btnConnect.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2v5M5 4l3 3 3-3M2 10v2a2 2 0 002 2h8a2 2 0 002-2v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        Подключить
      `
    }
    if (btnDisconnect) btnDisconnect.style.display = connected ? '' : 'none'
    if (btnSend) btnSend.disabled = !connected
    setOledButtonsEnabled(connected)
    indicator?.classList.toggle('connected', connected)
    if (statusText) statusText.textContent = connected ? 'Подключено' : 'Отключено'
  }
}

function setOledButtonsEnabled(enabled: boolean) {
  const buttons = [
    $('#btnOledSend') as HTMLButtonElement | null,
    $('#btnOledRead') as HTMLButtonElement | null,
    $('#btnOledBitmap') as HTMLButtonElement | null,
    $('#btnOledAngles') as HTMLButtonElement | null,
  ]

  buttons.forEach((button) => {
    if (button) button.disabled = !enabled
  })
}

function setOledAnglesMode(enabled: boolean) {
  oledAnglesMode = enabled
  const btnAngles = $('#btnOledAngles') as HTMLButtonElement | null
  btnAngles?.classList.toggle('btn--active', enabled)
  btnAngles?.setAttribute('aria-pressed', String(enabled))
}

// ─── OLED display controls ─────────────────────────
function initOledPanel() {
  const input = $('#oledTextInput') as HTMLInputElement | null
  const btnSend = $('#btnOledSend') as HTMLButtonElement | null
  const btnRead = $('#btnOledRead') as HTMLButtonElement | null
  const btnBitmap = $('#btnOledBitmap') as HTMLButtonElement | null
  const btnAngles = $('#btnOledAngles') as HTMLButtonElement | null
  const clearButton = $('#btnClearLog') as HTMLButtonElement | null

  showOledText('OLED READY')

  async function sendCommand(command: string) {
    if (!serial.isConnected()) {
      addLogEntry('err', 'Не подключено')
      return
    }

    try {
      await serial.send(command)
      addLogEntry('tx', command)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка отправки'
      addLogEntry('err', msg)
    }
  }

  async function sendTextToOled() {
    const text = input?.value.trim() || ''
    if (!text) return

    setOledAnglesMode(false)
    clearButton?.setAttribute('disabled', 'true')
    showOledText(text)
    await sendCommand(`OLED_TEXT:${text};`)
    clearButton?.removeAttribute('disabled')
  }

  btnSend?.addEventListener('click', sendTextToOled)

  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendTextToOled()
  })

  btnRead?.addEventListener('click', async () => {
    clearButton?.setAttribute('disabled', 'true')

    const oledText = extractOledText(lastReceivedLine)
    if (oledText !== null) {
      showOledText(oledText)
    }

    await sendCommand('OLED_READ?;')
    clearButton?.removeAttribute('disabled')
  })

  btnBitmap?.addEventListener('click', () => {
    setOledAnglesMode(false)
    sendCommand('OLED_BITMAP?;')
  })

  btnAngles?.addEventListener('click', async () => {
    const nextMode = !oledAnglesMode
    setOledAnglesMode(nextMode)

    if (nextMode) {
      showOledText(buildAnglesText())
      await sendCommand('OLED_ANGLES?;')
      return
    }

    const text = input?.value.trim() || DEFAULT_OLED_TEXT
    showOledText(text)
    await sendCommand(`OLED_TEXT:${text};`)
  })
}

// ─── Manual input ───────────────────────────────────
function initManualInput() {
  const input = $('#manualInput') as HTMLInputElement | null
  const btn = $('#btnManualSend')

  function normalizeManualCommand(data: string): string {
    if (data.endsWith(';')) return data

    const knownCommand = data.startsWith('OLED_') ||
      data.startsWith('OLED_TEXT:') ||
      /^A\d+B\d+C\d+D\d+E\d+$/.test(data)

    return knownCommand ? `${data};` : data
  }

  async function send() {
    if (!input?.value.trim()) return

    const data = normalizeManualCommand(input.value.trim())
    input.value = ''

    if (!serial.isConnected()) {
      addLogEntry('err', 'Не подключено')
      return
    }

    try {
      await serial.send(data)
      addLogEntry('tx', data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка отправки'
      addLogEntry('err', msg)
    }
  }

  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') send()
  })
  btn?.addEventListener('click', send)
}

// ─── Clear log ──────────────────────────────────────
function initClearLog() {
  const btn = $('#btnClearLog')
  btn?.addEventListener('click', () => {
    const log = $('#monitorLog')
    if (log) log.innerHTML = ''
    addLogEntry('sys', 'Лог очищен')
  })
}

// ─── Mobile navigation ──────────────────────────────
function initMobileNav() {
  const layout = $('.layout')
  const sidebar = $('#sidebar')
  const monitor = $('#monitorPanel')
  const items = $$('.mobile-nav__item')
  const viewerPanel = $('.panel--viewer3d')
  const servosPanel = $('.panel--servos')

  items.forEach(item => {
    item.addEventListener('click', () => {
      const tab = (item as HTMLElement).dataset.tab
      if (!tab) return

      items.forEach(i => i.classList.remove('mobile-nav__item--active'))
      item.classList.add('mobile-nav__item--active')

      sidebar?.classList.remove('sidebar--open')
      monitor?.classList.remove('monitor--open')

      if (viewerPanel instanceof HTMLElement) viewerPanel.style.display = ''
      if (servosPanel instanceof HTMLElement) servosPanel.style.display = ''

      if (layout instanceof HTMLElement) layout.dataset.activeTab = tab

      switch (tab) {
        case 'servos':
          if (viewerPanel instanceof HTMLElement) viewerPanel.style.display = 'none'
          if (servosPanel instanceof HTMLElement) servosPanel.style.display = ''
          break
        case 'viewer3d':
          if (viewerPanel instanceof HTMLElement) viewerPanel.style.display = ''
          if (servosPanel instanceof HTMLElement) servosPanel.style.display = 'none'
          break
        case 'monitor':
          monitor?.classList.add('monitor--open')
          break
        case 'connect':
          sidebar?.classList.add('sidebar--open')
          break
      }
    })
  })
}

// ─── Menu toggle (mobile) ───────────────────────────
function initMenuToggle() {
  const btn = $('#menuToggle')
  const sidebar = $('#sidebar')

  btn?.addEventListener('click', () => {
    sidebar?.classList.toggle('sidebar--open')
  })
}

// ─── Hand Tracking Panel ─────────────────────
let handTracker: HandTrackerInstance | null = null

function initHandPanel() {
  const panel = $('#handPanel') as HTMLElement | null
  const header = $('#handPanelHeader') as HTMLElement | null
  const collapseBtn = $('#handPanelCollapse')
  const btnStart = $('#btnStartHand') as HTMLButtonElement | null
  const btnStop = $('#btnStopHand') as HTMLButtonElement | null
  const video = $('#handVideo') as HTMLVideoElement | null
  const canvas = $('#handCanvas') as HTMLCanvasElement | null
  const status = $('#handStatus') as HTMLElement | null
  const statusText = status?.querySelector('.hand-panel__status-text')

  const sensitivitySlider = $('#sensitivitySlider') as HTMLInputElement | null
  const sensitivityValue = $('#sensitivityValue')
  const pinchSlider = $('#pinchSensitivitySlider') as HTMLInputElement | null
  const pinchValue = $('#pinchSensitivityValue')

  if (!panel || !header || !video || !canvas) return

  // Collapse toggle
  collapseBtn?.addEventListener('click', () => {
    panel.classList.toggle('collapsed')
  })

  // Drag and drop
  initPanelDrag(panel, header)

  // Sensitivity sliders
  sensitivitySlider?.addEventListener('input', () => {
    if (sensitivityValue) sensitivityValue.textContent = `${sensitivitySlider.value}%`
  })

  pinchSlider?.addEventListener('input', () => {
    if (pinchValue) pinchValue.textContent = `${pinchSlider.value}%`
  })

  // Hand tracking callbacks
  const callbacks: HandTrackingCallbacks = {
    onAnglesUpdate: (angles) => {
      angles.forEach((angle, i) => {
        if (i < values.length) {
          const nextAngle = clampServoValue(i, angle)
          values[i] = nextAngle
          setServoAngle(i, nextAngle)

          const slider = $(`#s${i}`) as HTMLInputElement | null
          const valueEl = $(`#v${i}`)
          if (slider) {
            slider.value = String(nextAngle)
            updateTrackFill(i)
          }
          if (valueEl) {
            const numEl = valueEl.querySelector('.servo__number')
            if (numEl) numEl.textContent = String(nextAngle)
          }
        }
      })
      updatePacketPreview()
      updateOledAnglesPreview()
      scheduleServoSend()
    },
    onStatusChange: (newStatus) => {
      status?.classList.remove('detecting', 'tracking')
      if (newStatus === 'detecting') {
        status?.classList.add('detecting')
        if (statusText) statusText.textContent = 'Поиск руки...'
      } else if (newStatus === 'tracking') {
        status?.classList.add('tracking')
        if (statusText) statusText.textContent = 'Рука найдена'
      } else {
        if (statusText) statusText.textContent = 'Камера вкл'
      }
    },
    onLandmarks: (_landmarks) => {
      // Canvas drawing will be handled in handTracking.ts
    }
  }

  // Start button
  btnStart?.addEventListener('click', async () => {
    btnStart.disabled = true
    btnStart.textContent = 'Запуск...'

    try {
      if (!handTracker) {
        const { initHandTracking } = await import('./handTracking')
        handTracker = initHandTracking(video, canvas, callbacks, {
          getSensitivity,
          getPinchSensitivity,
        })
      }

      await handTracker.start()
      btnStart.style.display = 'none'
      if (btnStop) btnStop.style.display = ''
      if (statusText) statusText.textContent = 'Камера вкл'
      addLogEntry('sys', 'Трекинг рук запущен')
    } catch (err) {
      console.error('Failed to start hand tracking:', err)
      addLogEntry('err', 'Ошибка доступа к камере')
      btnStart.disabled = false
      btnStart.textContent = 'Запустить'
    }
  })

  // Stop button
  btnStop?.addEventListener('click', () => {
    if (!handTracker) return

    handTracker.stop()
    if (btnStop) btnStop.style.display = 'none'
    if (btnStart) {
      btnStart.style.display = ''
      btnStart.disabled = false
      btnStart.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 2l9 5-9 5V2z" fill="currentColor"/></svg>
        Запустить
      `
    }
    status?.classList.remove('detecting', 'tracking')
    if (statusText) statusText.textContent = 'Камера выкл'
    addLogEntry('sys', 'Трекинг рук остановлен')
  })
}

function initPanelDrag(panel: HTMLElement, handle: HTMLElement) {
  let isDragging = false
  let startX = 0
  let startY = 0
  let initialX = 0
  let initialY = 0

  handle.addEventListener('mousedown', (e) => {
    if ((e.target as HTMLElement).closest('button')) return

    isDragging = true
    panel.classList.add('dragging')

    const rect = panel.getBoundingClientRect()
    startX = e.clientX
    startY = e.clientY
    initialX = rect.left
    initialY = rect.top

    panel.style.right = 'auto'
    panel.style.left = `${initialX}px`
    panel.style.top = `${initialY}px`

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  })

  function onMouseMove(e: MouseEvent) {
    if (!isDragging) return

    const dx = e.clientX - startX
    const dy = e.clientY - startY

    let newX = initialX + dx
    let newY = initialY + dy

    const maxX = window.innerWidth - panel.offsetWidth - 10
    const maxY = window.innerHeight - panel.offsetHeight - 10

    newX = Math.max(10, Math.min(newX, maxX))
    newY = Math.max(10, Math.min(newY, maxY))

    panel.style.left = `${newX}px`
    panel.style.top = `${newY}px`
  }

  function onMouseUp() {
    isDragging = false
    panel.classList.remove('dragging')
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  // Touch support
  handle.addEventListener('touchstart', (e) => {
    if ((e.target as HTMLElement).closest('button')) return

    const touch = e.touches[0]
    isDragging = true
    panel.classList.add('dragging')

    const rect = panel.getBoundingClientRect()
    startX = touch.clientX
    startY = touch.clientY
    initialX = rect.left
    initialY = rect.top

    panel.style.right = 'auto'
    panel.style.left = `${initialX}px`
    panel.style.top = `${initialY}px`

    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd)
  })

  function onTouchMove(e: TouchEvent) {
    if (!isDragging) return
    e.preventDefault()

    const touch = e.touches[0]
    const dx = touch.clientX - startX
    const dy = touch.clientY - startY

    let newX = initialX + dx
    let newY = initialY + dy

    const maxX = window.innerWidth - panel.offsetWidth - 10
    const maxY = window.innerHeight - panel.offsetHeight - 10

    newX = Math.max(10, Math.min(newX, maxX))
    newY = Math.max(10, Math.min(newY, maxY))

    panel.style.left = `${newX}px`
    panel.style.top = `${newY}px`
  }

  function onTouchEnd() {
    isDragging = false
    panel.classList.remove('dragging')
    document.removeEventListener('touchmove', onTouchMove)
    document.removeEventListener('touchend', onTouchEnd)
  }
}

export function getSensitivity(): number {
  const slider = $('#sensitivitySlider') as HTMLInputElement | null
  return slider ? parseInt(slider.value, 10) / 100 : 0.5
}

export function getPinchSensitivity(): number {
  const slider = $('#pinchSensitivitySlider') as HTMLInputElement | null
  return slider ? parseInt(slider.value, 10) / 100 : 0.5
}

// ─── Bootstrap ──────────────────────────────────────
function init() {
  initSliders()
  initToggle()
  initConnectionUI()
  initManualInput()
  initClearLog()
  initOledPanel()
  initMobileNav()
  initMenuToggle()
  initHandPanel()
  updatePacketPreview()

  const viewerContainer = document.getElementById('viewer3dContainer')
  if (viewerContainer) {
    initViewer3D(viewerContainer)
  }

  addLogEntry('sys', 'Интерфейс загружен. Используйте слайдеры или трекинг рук для управления.')
}

document.addEventListener('DOMContentLoaded', init)
