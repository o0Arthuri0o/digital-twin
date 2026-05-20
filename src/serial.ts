/**
 * Web Serial API модуль для связи с Arduino
 *
 * Протокол:
 * TX: A{angle}B{angle}C{angle}D{angle}E{angle};
 * RX: текстовые строки (OK, ERR, отладка)
 * RX bitmap: #OLED_BITMAP:1024\n + 1024 raw bytes
 */

type SerialBytes = Uint8Array<ArrayBufferLike>
type ReceiveCallback = (data: string) => void
type BitmapCallback = (data: SerialBytes) => void
type DisconnectCallback = () => void

let port: SerialPort | null = null
let reader: ReadableStreamDefaultReader<SerialBytes> | null = null
let writer: WritableStreamDefaultWriter<SerialBytes> | null = null
let receiveCallback: ReceiveCallback | null = null
let bitmapCallback: BitmapCallback | null = null
let disconnectCallback: DisconnectCallback | null = null
let readLoopActive = false

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()
const OLED_BITMAP_BYTES = 1024

export function isSupported(): boolean {
  return 'serial' in navigator
}

export function isConnected(): boolean {
  return port !== null && writer !== null
}

export function onReceive(callback: ReceiveCallback): void {
  receiveCallback = callback
}

export function onBitmapReceive(callback: BitmapCallback): void {
  bitmapCallback = callback
}

export function onDisconnect(callback: DisconnectCallback): void {
  disconnectCallback = callback
}

export async function connect(baudRate: number): Promise<void> {
  if (!isSupported()) {
    throw new Error('Web Serial API не поддерживается в этом браузере')
  }

  if (isConnected()) {
    throw new Error('Уже подключено')
  }

  try {
    port = await navigator.serial.requestPort()

    await port.open({ baudRate })

    reader = port.readable!.getReader()
    writer = port.writable!.getWriter()

    readLoopActive = true
    readLoop()

    port.addEventListener('disconnect', handleDisconnect)

  } catch (err) {
    port = null
    reader = null
    writer = null

    if (err instanceof DOMException && err.name === 'NotFoundError') {
      throw new Error('Порт не выбран')
    }

    throw err
  }
}

async function readLoop(): Promise<void> {
  if (!reader) return

  let buffer: SerialBytes = new Uint8Array(0)
  let binaryBytesExpected = 0

  try {
    while (readLoopActive && reader) {
      const { value, done } = await reader.read()

      if (done) {
        break
      }

      if (value) {
        buffer = concatBytes(buffer, value)

        while (buffer.length > 0) {
          if (binaryBytesExpected > 0) {
            if (buffer.length < binaryBytesExpected) break

            const imageBytes = buffer.slice(0, binaryBytesExpected)
            buffer = buffer.slice(binaryBytesExpected)
            binaryBytesExpected = 0
            if (bitmapCallback) bitmapCallback(imageBytes)
            continue
          }

          const lineEnd = buffer.indexOf(10)
          if (lineEnd === -1) break

          const rawLine = buffer.slice(0, lineEnd)
          buffer = buffer.slice(lineEnd + 1)

          const line = textDecoder.decode(rawLine).trim()
          if (!line) continue

          const bitmapHeader = line.match(/^#OLED_BITMAP:(\d+)$/)
          if (bitmapHeader) {
            const bytesExpected = parseInt(bitmapHeader[1], 10)
            if (bytesExpected !== OLED_BITMAP_BYTES) {
              if (receiveCallback) {
                receiveCallback(`ERR invalid OLED bitmap length: ${bytesExpected}`)
              }
              continue
            }

            binaryBytesExpected = bytesExpected
            continue
          }

          if (receiveCallback) receiveCallback(line)
        }
      }
    }
  } catch (err) {
    if (readLoopActive) {
      console.error('Serial read error:', err)
    }
  }
}

function concatBytes(a: SerialBytes, b: SerialBytes): SerialBytes {
  const result = new Uint8Array(a.length + b.length)
  result.set(a, 0)
  result.set(b, a.length)
  return result
}

function handleDisconnect(): void {
  cleanup()
  if (disconnectCallback) {
    disconnectCallback()
  }
}

function cleanup(): void {
  readLoopActive = false
  reader = null
  writer = null
  port = null
}

export async function disconnect(): Promise<void> {
  if (!port) return

  readLoopActive = false

  try {
    if (reader) {
      await reader.cancel()
      reader.releaseLock()
    }
  } catch {
    // Игнорируем ошибки при отмене
  }

  try {
    if (writer) {
      await writer.close()
      writer.releaseLock()
    }
  } catch {
    // Игнорируем ошибки при закрытии
  }

  try {
    await port.close()
  } catch {
    // Игнорируем ошибки при закрытии порта
  }

  cleanup()
}

export async function send(data: string): Promise<void> {
  if (!writer) {
    throw new Error('Не подключено')
  }

  await writer.write(textEncoder.encode(data))
}
