import './style.css'
import { initViewer3D, setServoAngle } from './viewer3d'

const SERVO_CONFIG = [
  { id: 'A', min: 0, max: 180, initial: 90 },
  { id: 'B', min: 0, max: 180, initial: 110 },
  { id: 'C', min: 0, max: 180, initial: 45 },
  { id: 'D', min: 0, max: 180, initial: 90 },
  { id: 'E', min: 35, max: 90, initial: 90 },
] as const

const values: number[] = SERVO_CONFIG.map(s => s.initial)
let autoSend = false

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

// ─── Initialize sliders ─────────────────────────────
function initSliders() {
  $$('.servo__slider').forEach(el => {
    const slider = el as HTMLInputElement
    const index = +(slider.dataset.index ?? 0)

    updateTrackFill(index)

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

      if (autoSend) {
        addLogEntry('tx', buildPacket())
      }
    })
  })
}

function buildPacket(): string {
  return SERVO_CONFIG.map((s, i) => s.id + values[i]).join('') + ';'
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
  })
}

// ─── Connect / Disconnect buttons (UI-only stubs) ──
function initConnectionUI() {
  const btnConnect = $('#btnConnect') as HTMLButtonElement | null
  const btnDisconnect = $('#btnDisconnect') as HTMLButtonElement | null
  const btnSend = $('#btnSend') as HTMLButtonElement | null
  const indicator = $('#statusIndicator')
  const statusText = $('#statusText')

  btnConnect?.addEventListener('click', () => {
    setConnectedUI(true)
    addLogEntry('sys', 'Подключено (демо-режим)')
  })

  btnDisconnect?.addEventListener('click', () => {
    setConnectedUI(false)
    addLogEntry('sys', 'Отключено')
  })

  btnSend?.addEventListener('click', () => {
    addLogEntry('tx', buildPacket())
    setTimeout(() => {
      addLogEntry('rx', 'OK: angles received')
    }, 150)
  })

  function setConnectedUI(connected: boolean) {
    if (btnConnect) btnConnect.style.display = connected ? 'none' : ''
    if (btnDisconnect) btnDisconnect.style.display = connected ? '' : 'none'
    if (btnSend) btnSend.disabled = !connected
    indicator?.classList.toggle('connected', connected)
    if (statusText) statusText.textContent = connected ? 'Подключено' : 'Отключено'
  }
}

// ─── Manual input ───────────────────────────────────
function initManualInput() {
  const input = $('#manualInput') as HTMLInputElement | null
  const btn = $('#btnManualSend')

  function send() {
    if (!input?.value.trim()) return
    addLogEntry('tx', input.value.trim())
    input.value = ''
    setTimeout(() => {
      addLogEntry('rx', 'echo: OK')
    }, 120)
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

// ─── Bootstrap ──────────────────────────────────────
function init() {
  initSliders()
  initToggle()
  initConnectionUI()
  initManualInput()
  initClearLog()
  initMobileNav()
  initMenuToggle()
  updatePacketPreview()

  const viewerContainer = document.getElementById('viewer3dContainer')
  if (viewerContainer) {
    initViewer3D(viewerContainer)
  }

  addLogEntry('sys', 'Интерфейс загружен. Используйте слайдеры для настройки углов.')
}

document.addEventListener('DOMContentLoaded', init)
