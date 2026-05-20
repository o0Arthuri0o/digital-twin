import { readFileSync } from 'node:fs'

const filePath = new URL('../public/roboarm.glb', import.meta.url)
const buffer = readFileSync(filePath)

function fail(message) {
  console.error(`check:model failed: ${message}`)
  process.exit(1)
}

if (buffer.toString('utf8', 0, 4) !== 'glTF') {
  fail('public/roboarm.glb is not a GLB file')
}

const version = buffer.readUInt32LE(4)
if (version !== 2) {
  fail(`expected GLB version 2, got ${version}`)
}

let offset = 12
let gltf = null

while (offset + 8 <= buffer.length) {
  const chunkLength = buffer.readUInt32LE(offset)
  const chunkType = buffer.readUInt32LE(offset + 4)
  offset += 8

  if (chunkType === 0x4e4f534a) {
    const jsonText = buffer.toString('utf8', offset, offset + chunkLength).trim()
    gltf = JSON.parse(jsonText)
    break
  }

  offset += chunkLength
}

if (!gltf) {
  fail('GLB JSON chunk was not found')
}

const nodeNames = new Set((gltf.nodes ?? []).map((node) => node.name).filter(Boolean))
const requiredNodes = ['base', 'shoulder', 'elbow', 'wrist', 'finger_l', 'finger_r', 'OLED_SCREEN']
const missing = requiredNodes.filter((name) => !nodeNames.has(name))

if (missing.length > 0) {
  fail(`missing required node(s): ${missing.join(', ')}`)
}

console.log(`check:model ok: ${requiredNodes.length} required nodes found`)
