import { readFileSync } from 'node:fs'

const mainTs = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')
const ino = readFileSync(new URL('../arduino/oled_lab2/oled_lab2.ino', import.meta.url), 'utf8')
const serialTs = readFileSync(new URL('../src/serial.ts', import.meta.url), 'utf8')
const imageHeader = readFileSync(new URL('../arduino/oled_lab2/arduino_image.h', import.meta.url), 'utf8')

function fail(message) {
  console.error(`check:protocol failed: ${message}`)
  process.exit(1)
}

const expected = [
  { id: 'A', pin: 9, min: 0, max: 180, initial: 90 },
  { id: 'B', pin: 6, min: 0, max: 180, initial: 90 },
  { id: 'C', pin: 5, min: 0, max: 180, initial: 90 },
  { id: 'D', pin: 3, min: 0, max: 180, initial: 90 },
  { id: 'E', pin: 11, min: 35, max: 90, initial: 90 },
]

for (const channel of expected) {
  const uiPattern = new RegExp(`\\{ id: '${channel.id}', min: ${channel.min}, max: ${channel.max}, initial: ${channel.initial} \\}`)
  if (!uiPattern.test(mainTs)) {
    fail(`UI SERVO_CONFIG mismatch for channel ${channel.id}`)
  }
}

const pins = expected.map((channel) => channel.pin).join(', ')
const ids = expected.map((channel) => `'${channel.id}'`).join(', ')
const mins = expected.map((channel) => channel.min).join(', ')
const maxes = expected.map((channel) => channel.max).join(', ')

if (!ino.includes(`const byte servoPins[SERVO_COUNT] = {${pins}};`)) {
  fail('Arduino servo pin mapping mismatch')
}

if (!ino.includes(`const char servoIds[SERVO_COUNT] = {${ids}};`)) {
  fail('Arduino servo id mapping mismatch')
}

if (!ino.includes(`const int servoMin[SERVO_COUNT] = {${mins}};`)) {
  fail('Arduino servo min range mismatch')
}

if (!ino.includes(`const int servoMax[SERVO_COUNT] = {${maxes}};`)) {
  fail('Arduino servo max range mismatch')
}

if (!serialTs.includes('const OLED_BITMAP_BYTES = 1024')) {
  fail('Web Serial OLED bitmap byte count mismatch')
}

if (!imageHeader.includes('const unsigned int myBitmapSize = 1024;')) {
  fail('Arduino OLED bitmap byte count mismatch')
}

console.log('check:protocol ok: UI, Web Serial, and Arduino protocol constants match')
